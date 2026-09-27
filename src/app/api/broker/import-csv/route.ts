import { getDb } from "@/db";
import { trades } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";


function cleanCell(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

function parseHTMLReport(html: string): string[][] {
  const cleanHtml = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const allRows: string[][] = [];
  let trMatch;
  while ((trMatch = trRegex.exec(cleanHtml)) !== null) {
    const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    const cells: string[] = [];
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) cells.push(cleanCell(tdMatch[1]));
    const nonEmpty = cells.filter(c => c.length > 0);
    if (nonEmpty.length >= 1) allRows.push(nonEmpty);
  }
  // v32: lê SOMENTE a tabela "Posições" (fechadas). Para na próxima seção
  // (Ordens / Transações / Negócios / Posições Abertas / qualquer outro cabeçalho).
  const closedRows: string[][] = [];
  let inClosed = false;
  for (const row of allRows) {
    const lower = row.join(' ').toLowerCase();
    const isHeaderRow = (lower.includes('horário') || lower.includes('horario') || lower.includes('time')) && (lower.includes('ativo') || lower.includes('symbol'));
    const isSectionTitle = row.length === 1 && !/^\d{4}\.\d{2}\.\d{2}/.test(row[0]);
    if (!inClosed) {
      // cabeçalho da tabela Posições: tem Position/Posição + Lucro/Profit, e NÃO tem Oferta/Deal/Ordem/Estado
      const isPosHeader = isHeaderRow && (lower.includes('position') || lower.includes('posição') || lower.includes('posicao')) && (lower.includes('lucro') || lower.includes('profit')) && !lower.includes('oferta') && !lower.includes('deal') && !lower.includes('estado') && !lower.includes('mercado') && !lower.includes('market');
      if (isPosHeader) inClosed = true;
      continue;
    }
    // já dentro de Posições: qualquer título de seção ou novo cabeçalho encerra
    if (isSectionTitle || isHeaderRow) break;
    const hasDate = /^\d{4}\.\d{2}\.\d{2}/.test(row[0] || '');
    const hasSymbol = /^[A-Z0-9._#&-]{3,14}$/i.test(row[2] || '') && /[A-Z]/i.test(row[2] || '');
    const hasType = /^(buy|sell)/i.test(row[3] || '');
    if (hasDate && hasSymbol && hasType) closedRows.push(row);
    else if (!hasDate) break; // linha de totais (ex: "0.00 | 0.00 | 3.31") encerra a tabela
  }
  // remove duplicatas pelo ticket (Position)
  const seen = new Set<string>();
  return closedRows.filter(r => { const k = r[1]; if (!k || seen.has(k)) return false; seen.add(k); return true; });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData().catch(() => null);
    let fileText = '';
    let fileName = 'historico';
    if (formData) {
      const file = formData.get('file') as File;
      if (file) {
        fileName = file.name;
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        // UTF-16LE detection FF FE
        if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
          fileText = new TextDecoder('utf-16le').decode(buf);
        } else {
          fileText = await file.text();
          // If still has null chars, try utf-16le
          if (fileText.includes('\0')) {
            fileText = fileText.replace(/\0/g, '');
            if (!fileText.includes('<html') && !fileText.includes('<HTML')) {
              fileText = new TextDecoder('utf-16le').decode(buf);
            }
          }
        }
      } else {
        fileText = (formData.get('csv') as string) || '';
      }
    } else {
      const body = await request.json().catch(() => ({}));
      fileText = body.csv || body.text || body.html || '';
    }
    if (!fileText || fileText.trim().length < 10) return Response.json({ error: 'Arquivo vazio' }, { status: 400 });
    fileText = fileText.replace(/\0/g, '');
    
    const rows = parseHTMLReport(fileText);
    if (rows.length === 0) return Response.json({ error: 'Nenhuma operação encontrada - verifique se é HTML de histórico fechado', totalRows: 0, preview: fileText.slice(0, 500) }, { status: 400 });
    
    let imported = 0; let skipped = 0; let duplicates = 0;
    const errors: string[] = [];
    const db = getDb();

    // v32: tickets já existentes no banco (gravados em notes como "Ticket 123456") -> não duplica
    const existingTickets = new Set<string>();
    try {
      const prev = await db.select({ notes: trades.notes }).from(trades);
      for (const p of prev) { const m = /Ticket\s+(\d+)/.exec(p.notes || ''); if (m) existingTickets.add(m[1]); }
    } catch {}
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        let timeStr = row[0] || '';
        let ticket = row[1] || '';
        let symbol = row[2] || '';
        let type = row[3] || '';
        let profitStr = row[row.length - 1] || '';
        if (!/^\d{4}\.\d{2}\.\d{2}/.test(timeStr)) { skipped++; continue; }
        if (ticket && existingTickets.has(ticket)) { duplicates++; continue; }
        // "2026.09.17 19:16:54" -> Date + hora real
        const dm = /^(\d{4})\.(\d{2})\.(\d{2})(?:\s+(\d{2}):(\d{2}))?/.exec(timeStr.trim());
        let date: Date; let hhmm = '00:00';
        if (dm) {
          hhmm = dm[4] ? `${dm[4]}:${dm[5]}` : '00:00';
          date = new Date(Date.UTC(+dm[1], +dm[2] - 1, +dm[3], dm[4] ? +dm[4] : 0, dm[5] ? +dm[5] : 0));
        } else { date = new Date(); }
        const profit = parseFloat(profitStr.replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
        let direction = type.toLowerCase().includes('sell') ? 'SELL' : 'BUY';
        const resultType = profit > 0 ? 'WIN' : profit < 0 ? 'LOSS' : 'BREAK EVEN';
        const asset = symbol.toUpperCase().replace(/\.[A-Z]{1,3}$/, '').trim();
        const time = hhmm;
        const notes = `Ticket ${ticket} ${symbol} ${direction} ${profit} v32`;
        
        // v30: INSERT MINIMAL 6 COLUNAS - SEM SQL, SÓ DRIZZLE
        try {
          const [ins] = await db.insert(trades).values({
            date: date,
            time: time,
            asset: asset,
            direction: direction,
            session: 'Nova York',
            status: 'CLOSED',
          } as any).returning({ id: trades.id });
          
          // Update com result se conseguiu ID
          if (ins?.id) {
            try {
              await db.update(trades).set({
                resultAmount: String(profit),
                resultType: resultType,
                notes: notes,
              } as any).where(eq(trades.id, ins.id)).catch(()=>{});
            } catch {}
          }
          imported++; if (ticket) existingTickets.add(ticket);
        } catch (e2: any) {
          // Fallback ainda mais minimal: 5 colunas
          try {
            await db.insert(trades).values({
              date: date,
              time: time,
              asset: asset,
              direction: direction,
              session: 'Nova York',
            } as any);
            imported++;
          } catch (e3: any) {
            errors.push(`Linha ${i+1} ${asset} ${profit}: ${e3.message.slice(0, 180)}`);
            skipped++;
          }
        }
      } catch (e: any) {
        errors.push(`Linha ${i+1}: ${e.message.slice(0, 150)}`);
        skipped++;
      }
    }
    
    return Response.json({
      success: true, fileName, totalRows: rows.length, imported, skipped, duplicates, errors: errors.slice(0, 5),
      message: imported > 0
        ? `${imported} operações importadas com sucesso!${duplicates ? ` (${duplicates} já existiam e foram ignoradas)` : ''}`
        : duplicates > 0 ? `Nenhuma nova: as ${duplicates} operações do arquivo já estavam importadas.` : `Nenhuma importada. Detalhes: ${errors.slice(0,2).join(' | ')}`,
    });
  } catch (e: any) {
    console.error('[v32] Fatal:', e.message, e.stack);
    return Response.json({ error: 'Falha', details: e.message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ ok: true, version: 'v32 SO POSICOES', message: 'Importa apenas a tabela Posicoes do MT5, sem duplicar tickets' });
}
