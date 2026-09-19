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
    const nonEmpty = cells.filter(c => c.length > 0);
    if (nonEmpty.length >= 2) allRows.push(cells);
  }
  console.log(`[HTML Parser] Total TR rows: ${allRows.length}`);
  let positionsHeader: string[] | null = null;
  let positionsRows: string[][] = [];
  let inPositionsSection = false;
  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    const lowerJoined = row.join(' ').toLowerCase();
    const isPositionsHeader = (lowerJoined.includes('horário') || lowerJoined.includes('horario')) && (lowerJoined.includes('ativo') || lowerJoined.includes('symbol')) && lowerJoined.includes('lucro');
    const isDealsHeader = lowerJoined.includes('oferta') && (lowerJoined.includes('ativo') || lowerJoined.includes('symbol')) && lowerJoined.includes('lucro');
    if (isPositionsHeader) {
      console.log(`[HTML Parser] Found Positions header at ${i}: ${row.join('|')}`);
      positionsHeader = row.map(h => h.toLowerCase());
      inPositionsSection = true;
      positionsRows = [];
      continue;
    }
    if (isDealsHeader) {
      inPositionsSection = false;
      if (positionsRows.length > 0) break;
      continue;
    }
    if (lowerJoined.includes('ordens') && lowerJoined.length < 20) { inPositionsSection = false; continue; }
    if (lowerJoined.includes('transações') || lowerJoined.includes('transacoes')) {
      inPositionsSection = false;
      if (positionsRows.length > 0) break;
      continue;
    }
    if (lowerJoined.includes('posições abertas') || lowerJoined.includes('posicoes abertas')) { inPositionsSection = false; break; }
    if (inPositionsSection && positionsHeader) {
      const firstCell = row[0] || '';
      const hasDate = /\d{4}\.\d{2}\.\d{2}/.test(firstCell);
      const hasSymbol = row.some(c => /[A-Z0-9]{3,10}\.s/.test(c) || /EURUSD|USDJPY|GBPUSD|XAUUSD|NAS100|EURNZD|NZDCHF/.test(c));
      if (hasDate && hasSymbol) positionsRows.push(row);
    }
  }
  console.log(`[HTML Parser] Positions rows: ${positionsRows.length}`);
  if (positionsHeader && positionsRows.length > 0) return { headers: positionsHeader, rows: positionsRows };
  const tradeRows: string[][] = [];
  let fallbackHeaders = ['horário', 'position', 'ativo', 'tipo', 'volume', 'preço', 's / l', 't / p', 'horário', 'preço', 'comissão', 'swap', 'lucro'];
  for (const row of allRows) {
    const firstCell = row[0] || '';
    const hasDate = /\d{4}\.\d{2}\.\d{2}/.test(firstCell);
    const hasSymbol = row.some(c => /[A-Z]{3,6}\.s/.test(c));
    if (hasDate && hasSymbol && row.length >= 8) tradeRows.push(row);
  }
  return { headers: fallbackHeaders, rows: tradeRows };
}

function parseCSV(text: string): { headers: string[], rows: string[][] } {
  const firstLine = text.split('\n')[0] || '';
  let delimiter = ',';
  if (firstLine.includes(';') && firstLine.split(';').length > firstLine.split(',').length) delimiter = ';';
  if (firstLine.includes('\t')) delimiter = '\t';
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const parseLine = (line: string): string[] => {
    const result: string[] = []; let current = ''; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') { if (inQuotes && line[i+1] === '"') { current += '"'; i++; } else inQuotes = !inQuotes; }
      else if (char === delimiter && !inQuotes) { result.push(current.trim()); current = ''; } else current += char;
    }
    result.push(current.trim());
    return result.map(v => v.replace(/^["']|["']$/g, '').trim());
  };
  const headers = parseLine(lines[0]).map(h => h.toLowerCase().trim());
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

function mapRowToTrade(headers: string[], row: string[]) {
  if (row.length < 3) return null;
  const getByNames = (names: string[]): { value: string, index: number } => {
    for (const name of names) {
      for (let i = 0; i < headers.length; i++) {
        if (headers[i].includes(name) && row[i] && row[i].trim()) return { value: row[i], index: i };
      }
    }
    return { value: '', index: -1 };
  };
  let timeStr = ''; let symbol = ''; let type = ''; let volumeStr = ''; let priceStr = ''; let profitStr = ''; let ticket = '';
  const timeRes = getByNames(['horário', 'horario', 'time', 'data', 'date']);
  const symbolRes = getByNames(['ativo', 'símbolo', 'simbolo', 'symbol', 'asset']);
  const typeRes = getByNames(['tipo', 'type', 'direção', 'direction']);
  const volumeRes = getByNames(['volume', 'lote', 'lot']);
  const priceRes = getByNames(['preço', 'preco', 'price']);
  const profitRes = getByNames(['lucro', 'profit', 'resultado']);
  const ticketRes = getByNames(['position', 'negócio', 'negocio', 'deal', 'ticket', 'ordem', 'order']);
  timeStr = timeRes.value; symbol = symbolRes.value; type = typeRes.value; volumeStr = volumeRes.value; priceStr = priceRes.value; profitStr = profitRes.value; ticket = ticketRes.value;
  if (headers.length >= 12) {
    if (!timeStr && row[0]) timeStr = row[0];
    if (!ticket && row[1]) ticket = row[1];
    if (!symbol && row[2]) symbol = row[2];
    if (!type && row[3]) type = row[3];
    if (!volumeStr && row[4]) volumeStr = row[4];
    if (!priceStr && row[5]) priceStr = row[5];
    if (!profitStr && row[row.length - 1]) profitStr = row[row.length - 1];
  }
  if (!symbol) {
    for (const cell of row) {
      if (/^[A-Z]{3,6}\.s$/.test(cell.trim()) || /^[A-Z]{6,7}$/.test(cell.trim())) {
        if (/EURUSD|USDJPY|GBPUSD|AUDUSD|USDCAD|NZDUSD|EURJPY|GBPJPY|XAUUSD|XAGUSD|NAS100|US30|SPX|GER40/.test(cell)) { symbol = cell.trim(); break; }
      }
    }
  }
  if (!timeStr) {
    for (const cell of row) { if (/\d{4}\.\d{2}\.\d{2}/.test(cell)) { timeStr = cell; break; } }
  }
  if (!profitStr) {
    for (let i = row.length - 1; i >= 0; i--) {
      const cell = row[i].trim();
      if (/^-?\d+[\.,]?\d*$/.test(cell) && cell.length < 10) {
        const num = parseFloat(cell.replace(',', '.'));
        if (!isNaN(num) && Math.abs(num) < 10000) { profitStr = cell; break; }
      }
    }
  }
  if (!symbol || !timeStr) return null;
  let date: Date;
  try {
    let normalized = timeStr.replace(/\./g, '-').trim();
    date = new Date(normalized);
    if (isNaN(date.getTime())) date = new Date();
  } catch { date = new Date(); }
  const profit = parseFloat(profitStr.replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
  const volume = parseFloat(volumeStr.replace(',', '.').replace(/[^0-9.]/g, '')) || 0;
  const price = parseFloat(priceStr.replace(',', '.').replace(/[^0-9.]/g, '')) || 0;
  let direction = 'BUY';
  const typeLower = (type || '').toLowerCase();
  if (typeLower.includes('sell') || typeLower.includes('venda')) direction = 'SELL';
  else if (typeLower.includes('buy') || typeLower.includes('compra')) direction = 'BUY';
  const resultType = profit > 0 ? 'WIN' : profit < 0 ? 'LOSS' : 'BREAK EVEN';
  return {
    date, time: date.toTimeString().slice(0, 5),
    asset: symbol.toUpperCase().replace('.S', '').replace('.s', '').trim(),
    direction, session: 'Nova York',
    entryPrice: price ? String(price) : undefined,
    positionSize: volume ? String(volume) : undefined,
    resultAmount: String(profit), resultType,
    setup: 'Importado - DooPrime',
    notes: `Importado HTML DooPrime - Ticket ${ticket || 'N/A'} - ${symbol} ${direction} Lucro ${profit}`,
    isDemo: false, status: 'CLOSED',
  };
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
        // UTF-16LE BOM FF FE - FIX v17
        if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
          console.log('[CSV Import] Detected UTF-16LE BOM FF FE, decoding as utf-16le - FIX v17');
          fileText = new TextDecoder('utf-16le').decode(arrayBuffer);
        } else if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
          fileText = new TextDecoder('utf-8').decode(arrayBuffer.slice(3));
        } else {
          fileText = await file.text();
          if (fileText.includes('\0')) {
            console.log('[CSV Import] Detected null bytes, cleaning - FIX v17 UTF-16LE handling');
            const cleaned = fileText.replace(/\0/g, '');
            if (cleaned.includes('<html') || cleaned.includes('<table')) fileText = cleaned;
            else fileText = new TextDecoder('utf-16le').decode(arrayBuffer);
          }
        }
      } else fileText = (formData.get('csv') as string) || '';
    } else {
      const body = await request.json().catch(() => ({}));
      fileText = body.csv || body.text || body.html || '';
    }
    if (!fileText || fileText.trim().length < 10) return Response.json({ error: 'Arquivo vazio' }, { status: 400 });
    fileText = fileText.replace(/\0/g, '');
    console.log(`[CSV Import] FIX v17 - File: ${fileName} size=${fileText.length} isHTML=${fileText.includes('<html') || fileText.includes('<table')}`);
    let headers: string[] = []; let rows: string[][] = [];
    let isHTML = fileText.includes('<html') || fileText.includes('<table') || fileText.includes('<tr');
    if (isHTML) {
      const parsed = parseHTMLReport(fileText);
      headers = parsed.headers; rows = parsed.rows;
    } else {
      const parsed = parseCSV(fileText);
      headers = parsed.headers; rows = parsed.rows;
    }
    if (headers.length === 0 || rows.length === 0) {
      return Response.json({ error: 'Não consegui ler o arquivo', debug: { fileName, isHTML, headers, rowsCount: rows.length, preview: fileText.slice(0, 1000) } }, { status: 400 });
    }
    let imported = 0; let skipped = 0; let ignoredDeposits = 0;
    const errors: string[] = []; const sampleRows: any[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 2 || row.every(c => !c || c.trim() === '')) { skipped++; continue; }
      const mapped = mapRowToTrade(headers, row);
      if (i < 5) sampleRows.push({ row: row.slice(0,6), mapped: mapped ? `${mapped.asset} ${mapped.direction} ${mapped.resultAmount}` : 'null' });
      if (!mapped) {
        const text = row.join(' ').toLowerCase();
        if (text.includes('saldo') || text.includes('balance') || text.includes('depósito') || text.includes('deposit')) ignoredDeposits++;
        skipped++; continue;
      }
      try {
        const ticketMatch = mapped.notes.match(/Ticket (\d+)/);
        const ticket = ticketMatch ? ticketMatch[1] : '';
        if (ticket && ticket !== 'N/A') {
          const existing = await getDb().select({ id: trades.id }).from(trades).where(sql`${trades.notes} LIKE ${'%' + ticket + '%'}`).limit(1);
          if (existing.length > 0) { skipped++; continue; }
        }
        await getDb().insert(trades).values(mapped as any);
        imported++;
      } catch (e: any) {
        try {
          const minimal = { date: mapped.date, time: mapped.time, asset: mapped.asset, direction: mapped.direction, session: 'Nova York', resultAmount: mapped.resultAmount, resultType: mapped.resultType, notes: mapped.notes, setup: mapped.setup };
          await getDb().insert(trades).values(minimal as any);
          imported++;
        } catch (e2: any) { errors.push(`Linha ${i+2}: ${e2.message}`); skipped++; }
      }
    }
    return Response.json({
      success: true, fileName, isHTML, headers, totalRows: rows.length, imported, skipped, ignoredDeposits, errors: errors.slice(0, 10), sampleRows,
      message: imported > 0 ? `${imported} operações importadas! ${skipped} ignoradas.` : `Nenhuma operação importada. ${rows.length} linhas lidas. Debug: ${sampleRows.map(s => s.row.join('|')).join(' ; ')}`,
    });
  } catch (e: any) {
    console.error('[POST /api/broker/import-csv] Error:', e.message, e.stack);
    return Response.json({ error: 'Falha ao importar', details: e.message }, { status: 500 });
  }
}
