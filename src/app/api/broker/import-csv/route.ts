import { getDb } from "@/db";
import { trades } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cleanCell(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

function parseHTMLReport(html: string): { headers: string[], rows: string[][] } {
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
  console.log(`[HTML Parser v21] Total TR rows: ${allRows.length}`);
  
  const closedRows: string[][] = [];
  let currentHeader: string[] | null = null;
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
      console.log(`[v21] Closed header at ${i}: ${row.join('|')}`);
      if (!foundClosed) {
        currentHeader = row.map(h => h.toLowerCase());
        inClosed = true;
        continue;
      } else {
        console.log(`[v21] Ignoring second closed header (open positions)`);
        inClosed = false;
        continue;
      }
    }
    if (isOpenHeader) {
      console.log(`[v21] Open header at ${i}, stopping`);
      inClosed = false;
      if (closedRows.length > 0) break;
      continue;
    }
    if (isOrdersHeader || isDealsHeader) {
      if (inClosed && closedRows.length > 0) {
        foundClosed = true;
        inClosed = false;
      }
      continue;
    }
    if (inClosed) {
      const first = row[0] || '';
      const hasDate = /^\d{4}\.\d{2}\.\d{2}/.test(first);
      const hasSymbol = row.some(c => /[A-Z0-9]{3,10}\.s/.test(c));
      if (hasDate && hasSymbol) {
        console.log(`[v21] Collected: ${row[0]} ${row[2]} ${row[row.length-1]}`);
        closedRows.push(row);
      }
    }
  }
  
  console.log(`[v21] Total closed: ${closedRows.length}`);
  const headers = currentHeader || ['horário', 'position', 'ativo', 'tipo', 'volume', 'preço', 's / l', 't / p', 'horário', 'preço', 'comissão', 'swap', 'lucro'];
  return { headers, rows: closedRows };
}

function mapRowToTrade(headers: string[], row: string[]) {
  if (row.length < 3) return null;
  const get = (idx: number) => row[idx] || '';
  let timeStr = get(0);
  let ticket = get(1);
  let symbol = get(2);
  let type = get(3);
  let volumeStr = get(4);
  let priceStr = get(5);
  let profitStr = get(row.length - 1);
  
  if (!/[A-Z0-9]{3,10}\.s/.test(symbol)) return null;
  if (!/^\d{4}\.\d{2}\.\d{2}/.test(timeStr)) return null;
  
  let date: Date;
  try { date = new Date(timeStr.replace(/\./g, '-').trim()); if (isNaN(date.getTime())) date = new Date(); } catch { date = new Date(); }
  
  const profit = parseFloat(profitStr.replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
  const volume = parseFloat(volumeStr.replace(',', '.').replace(/[^0-9.]/g, '')) || 0;
  const price = parseFloat(priceStr.replace(',', '.').replace(/[^0-9.]/g, '')) || 0;
  
  let direction = type.toLowerCase().includes('sell') ? 'SELL' : 'BUY';
  const resultType = profit > 0 ? 'WIN' : profit < 0 ? 'LOSS' : 'BREAK EVEN';
  
  return {
    date, time: date.toTimeString().slice(0, 5),
    asset: symbol.toUpperCase().replace('.S', '').replace('.s', '').trim(),
    direction, session: 'Nova York',
    entryPrice: price ? String(price) : undefined,
    positionSize: volume ? String(volume) : undefined,
    resultAmount: String(profit), resultType,
    setup: 'Importado - DooPrime',
    notes: `Importado v21 - Ticket ${ticket} - ${symbol} ${direction} Lucro ${profit}`,
    isDemo: false, status: 'CLOSED',
  };
}

async function resilientInsert(values: any) {
  let attempt = { ...values };
  for (let i = 0; i < 10; i++) {
    try {
      const [inserted] = await getDb().insert(trades).values(attempt).returning({ id: trades.id });
      return inserted;
    } catch (e: any) {
      const col = e.message.match(/column "([^"]+)" of relation/)?.[1] || e.message.match(/column "([^"]+)" does not exist/)?.[1];
      if (col) { delete attempt[col]; const camel = col.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase()); delete attempt[camel]; continue; }
      throw e;
    }
  }
  throw new Error("Failed after retries");
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
          console.log('[v21] UTF-16LE BOM detected');
          fileText = new TextDecoder('utf-16le').decode(arrayBuffer);
        } else {
          fileText = await file.text();
          if (fileText.includes('\0')) {
            console.log('[v21] null bytes detected, cleaning');
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
    console.log(`[v21] File: ${fileName} size=${fileText.length}`);
    
    const isHTML = fileText.includes('<html') || fileText.includes('<table') || fileText.includes('<tr');
    let headers: string[] = []; let rows: string[][] = [];
    
    if (isHTML) {
      const parsed = parseHTMLReport(fileText);
      headers = parsed.headers; rows = parsed.rows;
    } else {
      return Response.json({ error: 'Só HTML suportado nesta versão' }, { status: 400 });
    }
    
    if (rows.length === 0) return Response.json({ error: 'Nenhuma operação encontrada', debug: { fileName, preview: fileText.slice(0, 500) } }, { status: 400 });
    
    let imported = 0; let skipped = 0;
    const errors: string[] = [];
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const mapped = mapRowToTrade(headers, row);
      if (!mapped) { skipped++; continue; }
      try {
        const ticketMatch = mapped.notes.match(/Ticket (\d+)/);
        const ticket = ticketMatch ? ticketMatch[1] : '';
        if (ticket) {
          const existing = await getDb().select({ id: trades.id }).from(trades).where(sql`${trades.notes} LIKE ${'%' + ticket + '%'}`).limit(1);
          if (existing.length > 0) { skipped++; continue; }
        }
        await resilientInsert(mapped as any);
        imported++;
      } catch (e: any) {
        console.error(`[v21] Insert failed:`, e.message);
        errors.push(`Linha ${i+1}: ${e.message}`);
        skipped++;
      }
    }
    
    return Response.json({ success: true, fileName, totalRows: rows.length, imported, skipped, errors: errors.slice(0, 10), message: imported > 0 ? `${imported} operações importadas!` : `Nenhuma importada` });
  } catch (e: any) {
    console.error('[v21] Error:', e.message, e.stack);
    return Response.json({ error: 'Falha', details: e.message }, { status: 500 });
  }
}
