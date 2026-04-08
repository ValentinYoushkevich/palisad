import db from '@/db/indexedDb'

export async function upsertMany(table, records) {
  if (!records.length) {
    return
  }

  await db.table(table).bulkPut(records)
}

export async function clearTable(table) {
  await db.table(table).clear()
}

export async function getAll(table) {
  return db.table(table).toArray()
}

export async function getById(table, id) {
  return db.table(table).get(id)
}

export async function deleteById(table, id) {
  return db.table(table).delete(id)
}
