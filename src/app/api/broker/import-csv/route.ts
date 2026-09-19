import { getDb } from "@/db";
import { trades } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseCSV(text: string): { headers: string[], rows: string[][] } {
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
        if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim()); current = '';
      } else current += char;
    }
    result.push(current.trim());
    return result.map(v => v.replace(/^["']|["']$/g, '').trim());
  };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().trim());
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

// Parse HTML reports - improved for DooPrime PT-BR
function parseHTMLReport(html: string): { headers: string[], rows: string[][] } {
  // Remove scripts, styles
  let cleanHtml = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  
  // Find all tables
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  const tables: string[][][] = [];
  let tableMatch;
  
  while ((tableMatch = tableRegex.exec(cleanHtml)) !== null) {
    const tableContent = tableMatch[1];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const rows: string[][] = [];
    let rowMatch;
    
    while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
      const rowContent = rowMatch[1];
      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      const cells: string[] = [];
      let cellMatch;
      
      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        let cellText = cellMatch[1]
          .replace(/<[^>]+>/g, '') // remove inner tags
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+/g, ' ')
          .trim();
        cells.push(cellText);
      }
      
      if (cells.length > 1 && cells.some(c => c.length > 0)) {
        rows.push(cells);
      }
    }
    
    if (rows.length > 3) { // só tabelas com conteúdo
      tables.push(rows);
    }
  }
  
  console.log(`[HTML Parser] Found ${tables.length} tables`);
  
  // Procura tabela de deals - aquela com mais linhas e que contém símbolos e lucro
  let bestTable: string[][] | null = null;
  let bestScore = 0;
  
  for (const table of tables) {
    if (table.length < 2) continue;
    
    const headers = table[0].map(h => h.toLowerCase());
    const headerText = headers.join(' ');
    
    let score = 0;
    // Pontua por conter palavras-chave PT e EN
    if (headerText.includes('símbolo') || headerText.includes('symbol') || headerText.includes('simbolo')) score += 10;
    if (headerText.includes('lucro') || headerText.includes('profit') || headerText.includes('resultado')) score += 10;
    if (headerText.includes('hora') || headerText.includes('time') || headerText.includes('data')) score += 5;
    if (headerText.includes('tipo') || headerText.includes('type') || headerText.includes('direção') || headerText.includes('direction')) score += 5;
    if (headerText.includes('volume') || headerText.includes('lote')) score += 3;
    if (headerText.includes('preço') || headerText.includes('price') || headerText.includes('preco')) score += 3;
    
    // Verifica se linhas parecem trades (contêm símbolos tipo EURUSD, XAUUSD, etc)
    let symbolMatches = 0;
    for (let i = 1; i < Math.min(table.length, 10); i++) {
      const rowText = table[i].join(' ');
      if (/[A-Z]{3,6}[\.\/]?[A-Z]{0,3}/.test(rowText) && /-?\d+\.\d+/.test(rowText)) {
        symbolMatches++;
      }
    }
    score += symbolMatches * 2;
    
    // Tamanho da tabela também importa
    score += Math.min(table.length / 10, 10);
    
    console.log(`[HTML Parser] Table score ${score}: headers=${headers.slice(0,5).join('|')} rows=${table.length}`);
    
    if (score > bestScore) {
      bestScore = score;
      bestTable = table;
    }
  }
  
  if (!bestTable) {
    // Fallback: pega maior tabela
    bestTable = tables.sort((a,b) => b.length - a.length)[0] || [];
  }
  
  if (!bestTable || bestTable.length < 2) {
    return { headers: [], rows: [] };
  }
  
  const headers = bestTable[0].map(h => h.toLowerCase().trim());
  const rows = bestTable.slice(1);
  
  console.log(`[HTML Parser] Best table: ${headers.join(', ')} | ${rows.length} rows`);
  
  return { headers, rows };
}

function mapRowToTrade(headers: string[], row: string[]) {
  if (row.length < 2) return null;
  
  const getByNames = (names: string[]): string => {
    for (const name of names) {
      for (let i = 0; i < headers.length; i++) {
        if (headers[i].includes(name) && row[i]) return row[i];
      }
    }
    return '';
  };
  
  const getByIndex = (possibleNames: string[]): string => {
    // Tenta por nome, se não achar tenta por posição comum em relatórios MT5
    let val = getByNames(possibleNames);
    if (val) return val;
    
    // Fallback por posição: tenta encontrar padrão na linha
    const rowText = row.join(' | ').toLowerCase();
    // Se linha parece ser de trade, tenta extrair por regex
    return '';
  };

  // Campos com suporte PT-BR e EN
  let timeStr = getByNames(['hora', 'time', 'data', 'date', 'open time', 'close time']);
  let symbol = getByNames(['símbolo', 'simbolo', 'symbol', 'ativo', 'asset']);
  let type = getByNames(['tipo', 'type', 'direção', 'direction', 'operação', 'operation']);
  let volumeStr = getByNames(['volume', 'lote', 'lot', 'quantidade', 'quantity']);
  let priceStr = getByNames(['preço', 'preco', 'price', 'abertura', 'open price', 'fechamento']);
  let profitStr = getByNames(['lucro', 'profit', 'resultado', 'p/l', 'pl', 'result']);
  let ticket = getByNames(['negócio', 'negocio', 'deal', 'ticket', 'ordem', 'order', 'id']);
  let swap = getByNames(['swap']);
  let commission = getByNames(['comissão', 'comissao', 'commission']);

  // Se não achou por header, tenta por posição e regex na linha
  if (!symbol) {
    // Procura padrão de símbolo: 6 letras maiúsculas, ex: EURUSD, GBPUSD, XAUUSD, USDJPY
    for (const cell of row) {
      const match = cell.match(/\b([A-Z]{3,6}(?:\.[a-z])?)\b/);
      if (match && /^(EUR|USD|GBP|JPY|AUD|CAD|CHF|NZD|XAU|XAG|BTC|ETH|US30|NAS100|SPX|GER40|UK100)/.test(match[1])) {
        symbol = match[1];
        break;
      }
    }
    // Fallback mais amplo
    if (!symbol) {
      for (const cell of row) {
        if (/^[A-Z]{6,7}(\.[a-z])?$/.test(cell.trim()) && cell.length <= 10) {
          symbol = cell.trim();
          break;
        }
      }
    }
  }

  if (!timeStr) {
    // Procura data na linha: 2024.09.16 22:15 ou 16/09/2024 ou 2024-09-16
    for (const cell of row) {
      if (/\d{4}[\.\-\/]\d{2}[\.\-\/]\d{2}.*\d{2}:\d{2}/.test(cell) || /\d{2}[\.\-\/]\d{2}[\.\-\/]\d{4}/.test(cell)) {
        timeStr = cell;
        break;
      }
    }
  }

  if (!profitStr) {
    // Procura último número com sinal que parece lucro
    // Em relatórios MT5, lucro é geralmente penúltima ou última coluna antes do saldo
    for (let i = row.length - 1; i >= 0; i--) {
      const cell = row[i].replace(',', '.').trim();
      if (/^-?\d+\.?\d*$/.test(cell) && cell !== '' && !cell.includes(':')) {
        const num = parseFloat(cell);
        if (!isNaN(num) && Math.abs(num) < 100000) { // lucro razoável
          profitStr = cell;
          break;
        }
      }
    }
  }

  if (!symbol || !timeStr) {
    // Linha não parece ser trade
    return null;
  }

  // Parse data
  let date: Date;
  try {
    let normalized = timeStr.replace(/\./g, '-').replace(/\//g, '-').trim();
    // Tenta vários formatos
    if (/^\d{4}-\d{2}-\d{2}/.test(normalized)) {
      date = new Date(normalized);
    } else if (/^\d{2}-\d{2}-\d{4}/.test(normalized)) {
      const [d, m, yTime] = normalized.split('-');
      const [y, ...timeParts] = yTime.split(' ');
      // Na verdade formato é DD-MM-YYYY
      const parts = normalized.split(' ');
      const datePart = parts[0];
      const timePart = parts[1] || '00:00:00';
      const [day, month, year] = datePart.split('-');
      date = new Date(`${year}-${month}-${day}T${timePart}`);
    } else {
      date = new Date(normalized);
    }
    if (isNaN(date.getTime())) date = new Date();
  } catch {
    date = new Date();
  }

  const profit = parseFloat(profitStr.replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
  const volume = parseFloat(volumeStr.replace(',', '.').replace(/[^0-9.]/g, '')) || 0;
  const price = parseFloat(priceStr.replace(',', '.').replace(/[^0-9.]/g, '')) || 0;

  let direction = 'BUY';
  const typeLower = (type || '').toLowerCase();
  if (typeLower.includes('sell') || typeLower.includes('venda') || typeLower.includes('short')) direction = 'SELL';
  else if (typeLower.includes('buy') || typeLower.includes('compra') || typeLower.includes('long')) direction = 'BUY';
  else {
    // Tenta inferir por lucro e tipo numérico do MT5: 0=Buy, 1=Sell
    if (typeLower === '1' || typeLower.includes('sell')) direction = 'SELL';
  }

  // Ignora linhas que não são trades de verdade (depósitos, saldo, etc)
  const lowerRow = row.join(' ').toLowerCase();
  if (lowerRow.includes('saldo') || lowerRow.includes('balance') || lowerRow.includes('depósito') || lowerRow.includes('deposit') || lowerRow.includes('saque') || lowerRow.includes('withdrawal')) {
    if (Math.abs(profit) > 0 && symbol.toLowerCase().includes('usd') === false) {
      // Pode ser depósito, ignora se profit é igual a balance
    }
    // Se linha contém "balance" e não tem símbolo de forex, ignora
    if (!/[A-Z]{6}/.test(symbol)) return null;
  }

  const resultType = profit > 0 ? 'WIN' : profit < 0 ? 'LOSS' : 'BREAK EVEN';

  return {
    date,
    time: date.toTimeString().slice(0, 5),
    asset: symbol.toUpperCase().replace('.A', '').replace('.B', '').replace('.C', '').trim(),
    direction,
    session: 'Nova York',
    entryPrice: price ? String(price) : undefined,
    positionSize: volume ? String(volume) : undefined,
    resultAmount: String(profit),
    resultType,
    setup: 'Importado - DooPrime HTML',
    notes: `Importado HTML - Ticket ${ticket || 'N/A'} - ${symbol} ${direction} Profit ${profit}`,
    isDemo: false,
    status: 'CLOSED',
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData().catch(() => null);
    let fileText = '';
    let fileName = '';

    if (formData) {
      const file = formData.get('file') as File;
      if (file) {
        fileText = await file.text();
        fileName = file.name;
      } else {
        fileText = (formData.get('csv') as string) || '';
      }
    } else {
      const body = await request.json().catch(() => ({}));
      fileText = body.csv || body.text || body.html || '';
    }

    if (!fileText || fileText.trim().length < 10) {
      return Response.json({ error: 'Arquivo vazio' }, { status: 400 });
    }

    console.log(`[CSV Import] File: ${fileName} size=${fileText.length} isHTML=${fileText.includes('<html') || fileText.includes('<table')}`);

    let headers: string[] = [];
    let rows: string[][] = [];
    let isHTML = fileText.includes('<html') || fileText.includes('<table') || fileText.includes('<tr');

    if (isHTML) {
      const parsed = parseHTMLReport(fileText);
      headers = parsed.headers;
      rows = parsed.rows;
    } else {
      const parsed = parseCSV(fileText);
      headers = parsed.headers;
      rows = parsed.rows;
    }

    if (headers.length === 0 || rows.length === 0) {
      return Response.json({ 
        error: 'Não consegui ler o arquivo. Verifique se é relatório MT5 válido.',
        debug: { fileName, isHTML, length: fileText.length, preview: fileText.slice(0, 500) }
      }, { status: 400 });
    }

    console.log(`[CSV Import] Parsed: ${headers.join(', ')} | ${rows.length} rows`);

    let imported = 0;
    let skipped = 0;
    let ignoredDeposits = 0;
    const errors: string[] = [];
    const sampleRows: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 2 || row.every(c => !c || c.trim() === '')) { skipped++; continue; }

      // Ignora cabeçalhos repetidos no meio do arquivo
      if (row.join(' ').toLowerCase().includes('símbolo') && row.join(' ').toLowerCase().includes('lucro')) { skipped++; continue; }

      const mapped = mapRowToTrade(headers, row);
      
      if (i < 3) sampleRows.push({ row, mapped: mapped ? `${mapped.asset} ${mapped.direction} ${mapped.resultAmount}` : 'null' });

      if (!mapped) {
        // Verifica se é linha de saldo/depósito
        const text = row.join(' ').toLowerCase();
        if (text.includes('saldo') || text.includes('balance') || text.includes('depósito') || text.includes('deposit')) {
          ignoredDeposits++;
        }
        skipped++;
        continue;
      }

      try {
        // Verifica duplicado
        const ticketMatch = mapped.notes.match(/Ticket (\d+)/);
        const ticket = ticketMatch ? ticketMatch[1] : '';
        
        if (ticket && ticket !== 'N/A') {
          const existing = await getDb().select({ id: trades.id }).from(trades).where(sql`${trades.notes} LIKE ${'%' + ticket + '%'}`).limit(1);
          if (existing.length > 0) { skipped++; continue; }
        } else {
          // Verifica por data+asset+profit
          const dup = await getDb().select({ id: trades.id }).from(trades).where(sql`${trades.asset} = ${mapped.asset} AND ${trades.resultAmount} = ${mapped.resultAmount} AND DATE(${trades.date}) = DATE(${mapped.date}::timestamp)`).limit(1).catch(() => []);
          if (dup.length > 0) { skipped++; continue; }
        }

        await getDb().insert(trades).values(mapped as any);
        imported++;
      } catch (e: any) {
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
          errors.push(`Linha ${i+2}: ${e2.message} | ${row.slice(0,3).join(',')}`);
          skipped++;
        }
      }
    }

    return Response.json({
      success: true,
      fileName,
      isHTML,
      headers,
      totalRows: rows.length,
      imported,
      skipped,
      ignoredDeposits,
      errors: errors.slice(0, 15),
      sampleRows,
      message: imported > 0 ? `${imported} operações importadas! ${skipped} ignoradas.` : `Nenhuma operação importada. ${rows.length} linhas lidas, mas nenhuma pareceu trade válido. Verifique se o relatório contém operações fechadas com lucro.`,
    });

  } catch (e: any) {
    console.error('[POST /api/broker/import-csv] Error:', e.message, e.stack);
    return Response.json({ error: 'Falha ao importar', details: e.message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({
    message: 'POST com file',
    supported: ['MT5 HTML report PT-BR', 'MT5 HTML report EN', 'CSV com colunas Time,Symbol,Type,Profit', 'CSV com Símbolo,Tipo,Lucro'],
  });
}
