// Compatibility shim — the legacy `clients` table was merged into
// `organizations` during the Clerk cutover. A few schema files still
// import `clientsTable` from here; re-export the organizations table so
// references resolve to the same physical table without churning every
// downstream module.
export { organizationsTable as clientsTable } from "./organizations";
