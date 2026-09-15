/**
 * Совместимость: реэкспорт из model.js
 */
export {
  DAYS,
  DAY_SHORT,
  DESC_MAX,
  normalizeDay,
  jsDayToIndex,
  dayNameFromDate,
  capitalize,
  toDateKey,
  parseDateKey,
  startOfWeek,
  addDays,
  emptyStore,
  parseTaskCode,
  serializeToCode,
  resolveDayItems,
  itemIsDone,
  setItemStatus,
  applyCode,
  migrateFromV1,
  isV2,
} from "./model.js";
