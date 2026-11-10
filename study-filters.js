/* Shared, read-only filtering rules for maps, exports and the home summary. */
((root) => {
  "use strict";
  const getCurrentStudyYear = () => new Date().getFullYear();
  const getDefaultFilters = () => ({ year: "current", species: [], pointType: "all", dateFrom: "", dateTo: "", statuses: [], calendarYear: getCurrentStudyYear() });
  function ensureCurrentCalendar(filters) {
    return filters?.calendarYear === getCurrentStudyYear() ? filters : getDefaultFilters();
  }
  function observationDate(value) {
    const text = String(value ?? "").trim();
    const time = '(?:[T ](?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z|[+-](?:[01]\\d|2[0-3]):?[0-5]\\d)?)?';
    const iso = new RegExp('^(\\d{4})-(\\d{2})-(\\d{2})' + time + '$').exec(text);
    const polish = new RegExp('^(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})' + time + '$').exec(text);
    if (!iso && !polish) return "";
    const [year, month, day] = iso ? iso.slice(1).map(Number) : [Number(polish[3]), Number(polish[2]), Number(polish[1])];
    const date = new Date(year, month - 1, day, 12);
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return "";
    // obsDate is a calendar date; do not shift its day/year through UTC.
    return String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
  }
  function workingDate(item) {
    const raw = String(item?.createdAt ?? item?.created_at ?? "").trim();
    const day = observationDate(raw);
    if (!day) return "";
    if (!/^\d{4}-\d{2}-\d{2}[T ]/.test(raw)) return day;
    const date = new Date(raw.replace(" ", "T"));
    return Number.isFinite(date.getTime()) ? String(date.getFullYear()).padStart(4, "0") + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0") : "";
  }
  function getRecordStudyYear(entry) {
    const season = String(entry.season ?? "").trim();
    if (/^[1-9]\d{3}$/.test(season)) return Number(season);
    const date = observationDate(entry.obsDate);
    return date ? Number(date.slice(0, 4)) : null;
  }
  const getWorkingNestYear = (item) => { const date = workingDate(item); return date ? Number(date.slice(0, 4)) : null; };
  const isActive = (item) => !item.deletedAt && !item.deleted_at;
  function matchesPeriod(year, date, filters) {
    const selectedYear = filters.year === "current" ? getCurrentStudyYear() : Number(filters.year);
    return (filters.year === "all" || year === selectedYear) &&
      (!filters.dateFrom || !!date && date >= filters.dateFrom) && (!filters.dateTo || !!date && date <= filters.dateTo);
  }
  function coordinates(lat, lon) {
    if (lat == null || lon == null || String(lat).trim() === "" || String(lon).trim() === "") return null;
    const a = Number(lat), b = Number(lon);
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 && (a !== 0 || b !== 0) ? [a, b] : null;
  }
  function filterRecords(entries, filters, speciesInfo) {
    return entries.filter((entry) => isActive(entry) && matchesPeriod(getRecordStudyYear(entry), observationDate(entry.obsDate), filters) &&
      (!filters.species.length || filters.species.includes(speciesInfo(entry).key)) &&
      (filters.pointType === "all" || (filters.pointType === "gniazdo" ? coordinates(entry.lat, entry.lon) : coordinates(entry.randomMicro?.lat, entry.randomMicro?.lon))));
  }
  function filterRecordMapPoints(entries, filters, speciesInfo) {
    return filterRecords(entries, filters, speciesInfo).flatMap((entry) => {
      const points = [];
      const nest = coordinates(entry.lat, entry.lon), control = coordinates(entry.randomMicro?.lat, entry.randomMicro?.lon);
      if (nest && filters.pointType !== "kontrola") points.push({ entry, pos: nest, type: "gniazdo" });
      if (control && filters.pointType !== "gniazdo") points.push({ entry, pos: control, type: "kontrola" });
      return points;
    });
  }
  function filterWorkingNests(items, filters, speciesInfo) {
    return items.filter((item) => isActive(item) && matchesPeriod(getWorkingNestYear(item), workingDate(item), filters) &&
      (!filters.statuses?.length || filters.statuses.includes(item.status || "do_sprawdzenia")) &&
      (!filters.species.length || filters.species.includes(speciesInfo(item).key)));
  }
  function getAvailableSpecies(entries, speciesInfo) {
    const species = new Map();
    entries.filter(isActive).forEach((entry) => {
      const info = speciesInfo(entry);
      if (info.key && !species.has(info.key)) species.set(info.key, info);
    });
    return [...species.values()].sort((a, b) => a.polish.localeCompare(b.polish, "pl"));
  }
  root.StudyFilters = { getCurrentStudyYear, getDefaultFilters, ensureCurrentCalendar, observationDate, workingDate, getRecordStudyYear, getWorkingNestYear, coordinates, filterRecords, filterRecordMapPoints, filterWorkingNests, getAvailableSpecies };
})(globalThis);
