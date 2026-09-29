const VALID_FILE_INDEX_DEPARTMENTS = new Set(['contabil', 'fiscal', 'pessoal', 'juridico'])

export function normalizeFileIndexDepartment(value) {
  return VALID_FILE_INDEX_DEPARTMENTS.has(value) ? value : ''
}
