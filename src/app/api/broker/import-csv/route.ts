import { getDb } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cleanCell(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

function parseHTMLReport(html: string): string[][] {
  let cleanHtml = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const allRows: string[][] = [];
  let trMatch;
  while ((trMatch = trRegex.exec(cleanHtml)) !== null) {
    const trContent = trMatch[1];
    const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    const cells: string[] = [];
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trContent)) !== null) {
      cells.push(cleanCell(tdMatch[1]));
    }
    if (cells.filter(c => c.length > 0).length >= 2) allRows.push(cells);
  }
  const closedRows: string[][] = [];
  let inClosed = false;
  let foundClosed = false;
  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    const lower = row.join(' ').toLowerCase();
    const isClosedHeader = (lower.includes('horário') || lower.includes('horario')) && lower.includes('ativo') && lower.includes('lucro') && !lower.includes('mercado') && !lower.includes('oferta');
    const isOpenHeader = lower.includes('posições abertas') || lower.includes('posicoes abertas') || lower.includes('preço de mercado');
    const isOrdersHeader = lower.includes('horário da abertura') && lower.includes('ordem');
    const isDealsHeader = lower.includes('oferta') && lower.includes('direção');
    if (isClosedHeader) {
      if (!foundClosed) { inClosed = true; continue; }
      else { inClosed = false; continue; }
    }
    if (isOpenHeader) { inClosed = false; if (closedRows.length > 0) break; continue; }
    if (isOrdersHeader || isDealsHeader) {
      if (inClosed && closedRows.length > 0) { foundClosed = true; inClosed = false; }
      continue;
    }
    if (inClosed) {
      const first = row[0] || '';
      const hasDate = /^\d{4}\.\d{2}\.\d{2}/.test(first);
      const hasSymbol = row.some(c => /[A-Z0-9]{3,10}\.s/.test(c));
      if (hasDate && hasSymbol) closedRows.push(row);
    }
  }
  return closedRows;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData().catch(() => null);
    let fileText = ''; let fileName = ''; let arrayBuffer: ArrayBuffer | null = null;
    if (formData) {
      const file = formData.get('file') as File;
      if (file) {
        fileName = file.name;
        arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
          fileText = new TextDecoder('utf-16le').decode(arrayBuffer);
        } else {
          fileText = await file.text();
          if (fileText.includes('\0')) {
            fileText = fileText.replace(/\0/g, '');
            if (!fileText.includes('<html')) fileText = new TextDecoder('utf-16le').decode(arrayBuffer);
          }
        }
      } else fileText = (formData.get('csv') as string) || '';
    } else {
      const body = await request.json().catch(() => ({}));
      fileText = body.csv || body.text || body.html || '';
    }
    if (!fileText || fileText.trim().length < 10) return Response.json({ error: 'Arquivo vazio' }, { status: 400 });
    fileText = fileText.replace(/\0/g, '');
    
    const rows = parseHTMLReport(fileText);
    if (rows.length === 0) return Response.json({ error: 'Nenhuma operação encontrada no HTML. Verifique se é relatório de Posições fechadas.', totalRows: 0 }, { status: 400 });
    
    let imported = 0; let skipped = 0;
    const errors: string[] = [];
    const db = getDb();
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        let timeStr = row[0] || '';
        let ticket = row[1] || '';
        let symbol = row[2] || '';
        let type = row[3] || '';
        let volumeStr = row[4] || '';
        let priceStr = row[5] || '';
        let profitStr = row[row.length - 1] || '';
        
        if (!/[A-Z0-9]{3,10}\.s/.test(symbol)) { skipped++; continue; }
        if (!/^\d{4}\.\d{2}\.\d{2}/.test(timeStr)) { skipped++; continue; }
        
        let date: Date;
        try { date = new Date(timeStr.replace(/\./g, '-').trim()); if (isNaN(date.getTime())) date = new Date(); } catch { date = new Date(); }
        
        const profit = parseFloat(profitStr.replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
        const volume = parseFloat(volumeStr.replace(',', '.').replace(/[^0-9.]/g, '')) || 0;
        const price = parseFloat(priceStr.replace(',', '.').replace(/[^0-9.]/g, '')) || 0;
        
        let direction = type.toLowerCase().includes('sell') ? 'SELL' : 'BUY';
        const resultType = profit > 0 ? 'WIN' : profit < 0 ? 'LOSS' : 'BREAK EVEN';
        const asset = symbol.toUpperCase().replace('.S', '').replace('.s', '').trim();
        const time = date.toTimeString().slice(0, 5);
        const notes = `DooPrime Ticket ${ticket} ${symbol} ${direction} ${profit} v24`;
        
        // FIX v24 DEFINITIVO: SQL cru com apenas colunas que 100% existem
        // Evita drizzle que tenta inserir todas colunas
        try {
          await db.execute(sql`
            INSERT INTO trades (date, time, asset, direction, session, result_amount, result_type, notes, setup, status)
            VALUES (${date}, ${time}, ${asset}, ${direction}, ${'Nova York'}, ${String(profit)}, ${resultType}, ${notes}, ${'Importado - DooPrime'}, ${'CLOSED'})
          `);
          imported++;
        } catch (e1: any) {
          console.warn(`[v24] First insert failed: ${e1.message}, trying ultra minimal`);
          try {
            await db.execute(sql`
              INSERT INTO trades (date, time, asset, direction, session, result_amount, result_type)
              VALUES (${date}, ${time}, ${asset}, ${direction}, ${'Nova York'}, ${String(profit)}, ${resultType})
            `);
            imported++;
          } catch (e2: any) {
            console.error(`[v24] Ultra minimal failed: ${e2.message}`);
            errors.push(`Linha ${i+1} ${symbol} ${profit}: ${e2.message.slice(0, 150)}`);
            skipped++;
          }
        }
      } catch (e: any) {
        errors.push(`Linha ${i+1}: ${e.message.slice(0, 100)}`);
        skipped++;
      }
    }
    
    return Response.json({
      success: true, fileName, totalRows: rows.length, imported, skipped, errors: errors.slice(0, 5),
      message: imported > 0 ? `${imported} operações importadas com sucesso!` : `Nenhuma importada. Erros: ${errors.slice(0,2).join('; ')}`,
    });
  } catch (e: any) {
    console.error('[v24] Fatal Error:', e.message, e.stack);
    return Response.json({ error: 'Falha definitiva', details: e.message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ 
    ok: true, 
    message: 'POST com file HTML MT5 para importar - FIX v24 definitivo com SQL cru',
    version: 'v24',
    test: 'Rota funcionando! Use POST via interface Configurações > Importar'
  });
}
