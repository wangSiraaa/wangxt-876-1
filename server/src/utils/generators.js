const { v4: uuidv4 } = require('uuid');

function pad(n, width = 4) {
  const s = String(n);
  return s.length >= width ? s : new Array(width - s.length + 1).join('0') + s;
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function genLeaseNo() {
  return `LS-${todayStr()}-${pad(Math.floor(Math.random() * 10000), 4)}`;
}
function genAppNo() {
  return `RA-${todayStr()}-${pad(Math.floor(Math.random() * 10000), 4)}`;
}
function genPlanNo() {
  return `RP-${todayStr()}-${pad(Math.floor(Math.random() * 10000), 4)}`;
}
function genContractNo() {
  return `CT-${todayStr()}-${pad(Math.floor(Math.random() * 10000), 4)}`;
}
function genBillNo() {
  return `OB-${todayStr()}-${pad(Math.floor(Math.random() * 10000), 4)}`;
}

function genUuid() {
  return uuidv4();
}

function formatMoney(num) {
  const n = parseFloat(num) || 0;
  return n.toFixed(2);
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function daysBetween(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diff = Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24));
  return diff;
}

function daysFromNow(targetDate) {
  return daysBetween(new Date(), targetDate);
}

module.exports = {
  genLeaseNo,
  genAppNo,
  genPlanNo,
  genContractNo,
  genBillNo,
  genUuid,
  formatMoney,
  addMonths,
  daysBetween,
  daysFromNow
};
