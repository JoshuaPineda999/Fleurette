// Daily, monthly and date-range sales report: the numbers, and the CSV and Excel files.
//
// A transaction is one sale or pre-order:
// { type, date, customer, items: [{ name, color, size, qty }], collected, orderValue, discount, promoCode, balance, paymentMethod, soldAt, status }
// soldAt is the pop-up event a sale was made at ('' for the boutique and for pre-orders).
// collected matches the Sales Ledger: a sale's amount, or what a pre-order has paid so far.

const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const sumOf = (rows, field) => round(rows.reduce((sum, row) => sum + (row[field] || 0), 0));

// A mode of payment as it reads on screen and in the files: 'GCash', or 'GCash ₱500.00 + Cash ₱300.00' for a split.
export const paymentLabel = (method, split) => (split?.length
  ? split.map(p => `${p.method} ₱${(parseFloat(p.amount) || 0).toFixed(2)}`).join(' + ')
  : method || '');

export const itemLabel = ({ name, color, size, qty }) => `${name}${color ? ` (${color})` : ''}${size ? ` ${size}` : ''} x${qty}`;

// One line per style, colour and size: a sale split across batches is still one item to the reader.
const mergedItems = (items) => {
  const merged = new Map();
  items.forEach(it => {
    const key = `${it.name}|${it.color}|${it.size}`;
    if (merged.has(key)) merged.get(key).qty += it.qty;
    else merged.set(key, { ...it });
  });
  return [...merged.values()];
};

// period: 'YYYY-MM-DD' for one day, 'YYYY-MM' for one month, or { from, to } for a range of days (both included).
const inPeriod = (date, period) => (typeof period === 'string'
  ? date.startsWith(period)
  : date >= period.from && date <= period.to);

// How the period reads in the files: 'Daily sales report: 2026-11-09', and the file name part.
const periodTitle = (report) => (report.isRange
  ? `Sales report: ${report.period.from} to ${report.period.to}`
  : `${report.isMonth ? 'Monthly' : 'Daily'} sales report: ${report.period}`);
const periodFileName = (report) => (report.isRange ? `${report.period.from}-to-${report.period.to}` : report.period);

export const buildSalesReport = (transactions, period) => {
  const rows = transactions
    .filter(t => inPeriod(String(t.date || ''), period))
    .map(t => ({ ...t, items: mergedItems(t.items), pieces: t.items.reduce((sum, it) => sum + it.qty, 0) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const sales = rows.filter(t => t.type === 'Sale');
  const preOrders = rows.filter(t => t.type !== 'Sale');

  const days = new Map();
  rows.forEach(t => {
    const day = days.get(t.date) || { date: t.date, transactions: 0, pieces: 0, collected: 0, discount: 0 };
    day.transactions += 1;
    day.pieces += t.pieces;
    day.collected = round(day.collected + t.collected);
    day.discount = round(day.discount + t.discount);
    days.set(t.date, day);
  });

  const sellers = new Map();
  rows.forEach(t => t.items.forEach(it => {
    const key = `${it.name.trim().toLowerCase()}|${it.color.trim().toLowerCase()}`;
    const seller = sellers.get(key) || { name: it.name, color: it.color, pieces: 0, salePieces: 0, preOrderPieces: 0 };
    seller.pieces += it.qty;
    seller[t.type === 'Sale' ? 'salePieces' : 'preOrderPieces'] += it.qty;
    sellers.set(key, seller);
  }));

  const promos = new Map();
  rows.filter(t => t.discount > 0 || t.promoCode).forEach(t => {
    const code = t.promoCode.trim().toUpperCase();
    const promo = promos.get(code) || { code, uses: 0, discount: 0, orderValue: 0 };
    promo.uses += 1;
    promo.discount = round(promo.discount + t.discount);
    promo.orderValue = round(promo.orderValue + t.orderValue);
    promos.set(code, promo);
  });

  const popups = new Map();
  rows.filter(t => t.soldAt).forEach(t => {
    const popup = popups.get(t.soldAt) || { name: t.soldAt, transactions: 0, pieces: 0, collected: 0 };
    popup.transactions += 1;
    popup.pieces += t.pieces;
    popup.collected = round(popup.collected + t.collected);
    popups.set(t.soldAt, popup);
  });

  const payments = new Map();
  rows.forEach(t => {
    // A split counts toward each of its two modes of payment, with the amount paid through it.
    const parts = t.paymentSplit?.length
      ? t.paymentSplit.map(p => ({ method: p.method, amount: parseFloat(p.amount) || 0 }))
      : [{ method: t.paymentMethod || '', amount: t.collected }];
    parts.forEach(({ method, amount }) => {
      const payment = payments.get(method) || { method, transactions: 0, collected: 0 };
      payment.transactions += 1;
      payment.collected = round(payment.collected + amount);
      payments.set(method, payment);
    });
  });

  const isRange = typeof period !== 'string';
  return {
    period,
    isRange,
    isMonth: !isRange && period.length === 7,
    // A month or a range of more than one day is also broken down by day.
    byDay: isRange ? period.from !== period.to : period.length === 7,
    totals: {
      collected: sumOf(rows, 'collected'),
      fromSales: sumOf(sales, 'collected'),
      fromPreOrders: sumOf(preOrders, 'collected'),
      balance: sumOf(rows, 'balance'),
      discount: sumOf(rows, 'discount'),
      pieces: rows.reduce((sum, t) => sum + t.pieces, 0),
      transactions: rows.length,
    },
    days: [...days.values()],
    popups: [...popups.values()].sort((a, b) => b.collected - a.collected || a.name.localeCompare(b.name)),
    payments: [...payments.values()].sort((a, b) => b.collected - a.collected || a.method.localeCompare(b.method)),
    bestSellers: [...sellers.values()].sort((a, b) => b.pieces - a.pieces || a.name.localeCompare(b.name)),
    promos: [...promos.values()].sort((a, b) => b.discount - a.discount || a.code.localeCompare(b.code)),
    transactions: rows,
  };
};

const money = (value) => ({ money: value });

// The report as tables, shared by both file types.
const reportSections = (report) => {
  const { totals } = report;
  const sections = [{
    name: 'Summary',
    rows: [
      ['Report', periodTitle(report)],
      ['Revenue collected', money(totals.collected)],
      ['From sales', money(totals.fromSales)],
      ['From pre-orders', money(totals.fromPreOrders)],
      ['Balance still to collect', money(totals.balance)],
      ['Discounts given', money(totals.discount)],
      ['Transactions', totals.transactions],
      ['Pieces sold', totals.pieces],
      ['Note', 'Pre-orders count the money paid so far, under the date the order was made.'],
    ],
  }];
  if (report.byDay) {
    sections.push({
      name: 'By Day',
      header: ['Date', 'Transactions', 'Pieces', 'Revenue collected', 'Discounts'],
      rows: report.days.map(d => [d.date, d.transactions, d.pieces, money(d.collected), money(d.discount)]),
    });
  }
  if (report.popups.length) {
    sections.push({
      name: 'Pop-up Sales',
      header: ['Pop-up', 'Transactions', 'Pieces', 'Revenue collected'],
      rows: report.popups.map(p => [p.name, p.transactions, p.pieces, money(p.collected)]),
    });
  }
  sections.push({
    name: 'By Mode of Payment',
    header: ['Mode of payment', 'Transactions', 'Revenue collected'],
    rows: report.payments.map(p => [p.method || 'Not selected', p.transactions, money(p.collected)]),
  }, {
    name: 'Best Sellers',
    header: ['Rank', 'Style', 'Color', 'Pieces', 'From sales', 'From pre-orders'],
    rows: report.bestSellers.map((s, i) => [i + 1, s.name, s.color, s.pieces, s.salePieces, s.preOrderPieces]),
  }, {
    name: 'Promo Usage',
    header: ['Code', 'Times used', 'Discount given', 'Order value after discount'],
    rows: report.promos.map(p => [p.code || 'No code', p.uses, money(p.discount), money(p.orderValue)]),
  }, {
    name: 'Transactions',
    header: ['Date', 'Type', 'Customer', 'Items', 'Pieces', 'Sold at', 'Mode of payment', 'Promo code', 'Discount', 'Revenue collected', 'Balance', 'Status'],
    rows: report.transactions.map(t => [t.date, t.type, t.customer, t.items.map(itemLabel).join('; '), t.pieces, t.soldAt || (t.type === 'Sale' ? 'Boutique' : ''), t.paymentMethod, t.promoCode, money(t.discount), money(t.collected), money(t.balance), t.status]),
  });
  return sections;
};

// Customers type their own names on the website, and a spreadsheet would run text starting with
// one of these as a formula. Excel files store text as text, so only CSV needs this.
const csvCell = (cell) => {
  if (typeof cell === 'number') return String(cell);
  if (cell && typeof cell === 'object') return cell.money.toFixed(2);
  const text = /^[=+\-@\t\r]/.test(String(cell ?? '')) ? `'${cell}` : String(cell ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const salesReportCsv = (report) => reportSections(report)
  .flatMap(({ name, header, rows }) => [[name], ...(header ? [header] : []), ...rows, []])
  .map(row => row.map(csvCell).join(','))
  .join('\r\n');

const excelCell = (cell) => (cell && typeof cell === 'object' ? { value: cell.money, type: Number, format: '#,##0.00' } : (cell ?? null));
const cellWidth = (cell) => (cell && typeof cell === 'object' ? cell.money.toFixed(2) : String(cell ?? '')).length;

const saveFile = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const downloadSalesReportCsv = (report) => {
  // The mark at the start tells Excel the file is UTF-8, so names with accents show properly.
  saveFile(new Blob(['﻿', salesReportCsv(report)], { type: 'text/csv;charset=utf-8' }), `fleurette-sales-${periodFileName(report)}.csv`);
};

export const downloadSalesReportExcel = async (report) => {
  // Loaded on demand so the shop's pages don't carry the Excel code.
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const sheets = reportSections(report).map(({ name, header, rows }) => {
    const table = header ? [header, ...rows] : rows;
    const columnCount = Math.max(...table.map(row => row.length));
    return {
      sheet: name,
      data: [
        ...(header ? [header.map(value => ({ value, fontWeight: 'bold' }))] : []),
        ...rows.map(row => row.map(excelCell)),
      ],
      columns: Array.from({ length: columnCount }, (_, col) => ({
        width: Math.min(60, Math.max(10, ...table.map(row => cellWidth(row[col]) + 2))),
      })),
    };
  });
  saveFile(await writeExcelFile(sheets).toBlob(), `fleurette-sales-${periodFileName(report)}.xlsx`);
};
