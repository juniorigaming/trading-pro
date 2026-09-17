import { getDb } from "@/db";
import { trades } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseCSV(text: string): { headers: string[], rows: string[][] } {
  // Detect delimiter
  const firstLine = text.split('\n')[0] || '';
  let delimiter = ',';
  if (firstLine.includes(';') && firstLine.split(';').length > firstLine.split(',').length) delimiter = ';';
  if (firstLine.includes('\t')) delimiter = '\t';

  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i+1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result.map(v => v.replace(/^["']|["']$/g, '').trim());
  };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().trim());
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

function detectFormat(headers: string[]): 'mt5-deals' | 'mt5-history' | 'generic' | 'trading-pro' {
  const h = headers.join(' ');
  if (h.includes('deal') && h.includes('symbol') && h.includes('profit')) return 'mt5-deals';
  if (h.includes('ticket') && h.includes('symbol') && h.includes('profit')) return 'mt5-history';
  if (h.includes('asset') && (h.includes('result') || h.includes('profit'))) return 'trading-pro';
  return 'generic';
}

function mapRowToTrade(headers: string[], row: string[], format: string) {
  const get = (names: string[]): string => {
    for (const name of names) {
      const idx = headers.findIndex(h => h.includes(name));
      if (idx >= 0 && row[idx]) return row[idx];
    }
    return '';
  };

  // Try to find fields
  let dateStr = get(['time', 'date', 'open time', 'close time']);
  let symbol = get(['symbol', 'asset']);
  let type = get(['type', 'direction']);
  let profitStr = get(['profit', 'result_amount', 'resultamount', 'p/l', 'pl']);
  let volumeStr = get(['volume', 'position_size', 'lots']);
  let priceStr = get(['price', 'open price', 'entry_price']);
  let ticket = get(['deal', 'ticket', 'order']);

  if (!symbol || !dateStr) return null;

  // Parse date
  let date: Date;
  try {
    // MT5 format: 2024.09.16 22:15:30 or 2024-09-16 or 16/09/2024
    let normalized = dateStr.replace(/\./g, '-').replace(/\//g, '-');
    // If format is 2024-09-16 22:15:30
    date = new Date(normalized);
    if (isNaN(date.getTime())) {
      // Try DD-MM-YYYY
      const parts = normalized.split(' ');
      const datePart = parts[0];
      const timePart = parts[1] || '00:00:00';
      const dmy = datePart.split('-');
      if (dmy.length === 3 && dmy[0].length === 2) {
        // DD-MM-YYYY
        date = new Date(`${dmy[2]}-${dmy[1]}-${dmy[0]}T${timePart}`);
      } else {
        date = new Date();
      }
    }
  } catch {
    date = new Date();
  }

  const profit = parseFloat(profitStr.replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
  const volume = parseFloat(volumeStr.replace(',', '.')) || 0;
  const price = parseFloat(priceStr.replace(',', '.')) || 0;

  let direction = 'BUY';
  const typeLower = type.toLowerCase();
  if (typeLower.includes('sell') || typeLower.includes('short')) direction = 'SELL';
  else if (typeLower.includes('buy') || typeLower.includes('long')) direction = 'BUY';

  const resultType = profit > 0 ? 'WIN' : profit < 0 ? 'LOSS' : 'BREAK EVEN';

  return {
    date,
    time: date.toTimeString().slice(0, 5),
    asset: symbol.toUpperCase().replace('.a', '').replace('.b', '').trim(),
    direction,
    session: 'Nova York',
    entryPrice: price ? String(price) : undefined,
    positionSize: volume ? String(volume) : undefined,
    resultAmount: String(profit),
    resultType,
    setup: 'Importado - DooPrime CSV',
    notes: `Importado CSV - Ticket ${ticket || 'N/A'} - ${symbol} ${direction} Profit ${profit}`,
    isDemo: false,
    status: 'CLOSED',
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData().catch(() => null);
    let csvText = '';

    if (formData) {
      const file = formData.get('file') as File;
      if (file) {
        csvText = await file.text();
      } else {
        const text = formData.get('csv') as string;
        csvText = text || '';
      }
    } else {
      const body = await request.json().catch(() => ({}));
      csvText = body.csv || body.text || '';
    }

    if (!csvText || csvText.trim().length < 10) {
      return Response.json({ error: 'CSV vazio ou não enviado. Envie arquivo ou texto CSV.' }, { status: 400 });
    }

    // Se for HTML (relatório MT5), extrai tabela
    if (csvText.includes('<html') || csvText.includes('<table')) {
      // Extrai linhas da tabela HTML simples
      const tableMatch = csvText.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
      if (tableMatch) {
        const tableHtml = tableMatch[0];
        const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
        const parsedRows: string[][] = [];
        for (const row of rows) {
          const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
          if (cells.length > 0) parsedRows.push(cells);
        }
        if (parsedRows.length > 1) {
          csvText = parsedRows.map(r => r.join(',')).join('\n');
        }
      }
    }

    const { headers, rows } = parseCSV(csvText);
    if (headers.length === 0) {
      return Response.json({ error: 'Não consegui ler cabeçalhos do CSV. Verifique formato.' }, { status: 400 });
    }

    const format = detectFormat(headers);
    console.log(`[CSV Import] Format detected: ${format}, headers: ${headers.join(', ')}, rows: ${rows.length}`);

    let imported = 0;
    let skipped = 0;
    let errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 2 || row.every(c => !c)) continue;

      const mapped = mapRowToTrade(headers, row, format);
      if (!mapped) {
        skipped++;
        continue;
      }

      // Verifica duplicado por notes com ticket ou por data+asset+profit
      try {
        const existing = await getDb().select({ id: trades.id }).from(trades).where(sql`${trades.notes} LIKE ${'%' + (mapped.notes.split('Ticket')[1]?.split(' ')[1] || '') + '%'}`).limit(1).catch(() => []);
        // Se ticket vazio, verifica por data+asset+resultAmount
        if (mapped.notes.includes('N/A')) {
          const dup = await getDb().select({ id: trades.id }).from(trades).where(sql`${trades.date} = ${mapped.date} AND ${trades.asset} = ${mapped.asset} AND ${trades.resultAmount} = ${mapped.resultAmount}`).limit(1).catch(() => []);
          if (dup.length > 0) { skipped++; continue; }
        } else if (existing.length > 0) {
          skipped++;
          continue;
        }

        await getDb().insert(trades).values(mapped as any);
        imported++;
      } catch (e: any) {
        // Tenta insert mínimo
        try {
          const minimal = {
            date: mapped.date,
            time: mapped.time,
            asset: mapped.asset,
            direction: mapped.direction,
            session: 'Nova York',
            resultAmount: mapped.resultAmount,
            resultType: mapped.resultType,
            notes: mapped.notes,
            setup: mapped.setup,
          };
          await getDb().insert(trades).values(minimal as any);
          imported++;
        } catch (e2: any) {
          errors.push(`Linha ${i+2}: ${e2.message}`);
          skipped++;
        }
      }
    }

    return Response.json({
      success: true,
      format,
      headers,
      totalRows: rows.length,
      imported,
      skipped,
      errors: errors.slice(0, 10),
      message: `${imported} operações importadas! ${skipped} já existiam ou inválidas.`,
    });

  } catch (e: any) {
    console.error('[POST /api/broker/import-csv] Error:', e.message, e.stack);
    return Response.json({ error: 'Falha ao importar CSV', details: e.message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({
    message: 'Use POST com file ou csv text',
    example: {
      headers: ['Time', 'Symbol', 'Type', 'Volume', 'Price', 'Profit', 'Ticket'],
      sample: '2024.09.16 22:00:00, EURUSD.a, Buy, 0.10, 1.08500, 15.50, 123456',
    },
    mt5ExportHowTo: [
      'MT5 > Histórico (Toolbox) > clique direito > Relatório > HTML',
      'Ou: MT5 > Histórico > selecione período > clique direito > Salvar relatório',
      'Abra o HTML no Excel e salve como CSV, ou envie o HTML direto que tentamos ler',
      'Alternativa: use script gratuito "Export Deals to CSV" - cole no MT5 > File > Open Data Folder > MQL5 > Scripts',
    ],
  });
}
