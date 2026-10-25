// Each X estimates 65% of one half-hour of open-table time.
// This is a display calculation; the saved X/blank cells stay unchanged.
export const OPEN_TIME_FACTOR = 0.65;
export const MINUTES_PER_X = 30 * OPEN_TIME_FACTOR;
export const estimatedHours = marks => marks * MINUTES_PER_X / 60;
export const formatHours = marks => estimatedHours(marks).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export const OPEN_TIME_NOTE = `Estimated open time: each X = ${OPEN_TIME_FACTOR} × 30 minutes = ${MINUTES_PER_X} minutes. Table-hours add time across tables; they are not elapsed clock hours.`;

const TABLES = Object.freeze({
  '3': ['Ultimate Texas Holdem', 'UTH'],
  '5': ['BlackJack 1', 'BJ-1'],
  '6': ['Three Card Poker', 'TCP'],
  '7': ['Baccarat 2', 'BAC-2'],
  '8': ['BlackJack 2', 'BJ-2'],
  '9': ['Baccarat 1', 'BAC-1']
});
export function tableName(id,{short=false}={}) {
  const table=Object.prototype.hasOwnProperty.call(TABLES,String(id))?TABLES[String(id)]:null;
  return table?(short?table[1]:`${table[0]} (${table[1]})`):`Table ${id}`;
}

// Select values are hour starts in minutes. Include every observation in the
// final hour, including :30; the records module handles midnight wrapping.
export function hourWindow(from='',to='') {
  return {from:from===''?null:Number(from),to:to===''?null:Number(to)+59};
}
