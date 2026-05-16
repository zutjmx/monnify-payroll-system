"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const database_1 = require("../src/config/database");
async function runMigrations() {
    const migrationsDir = path_1.default.join(__dirname, '../migrations');
    const files = fs_1.default.readdirSync(migrationsDir).sort();
    for (const file of files) {
        if (file.endsWith('.sql')) {
            console.log(`Running migration: ${file}`);
            const sql = fs_1.default.readFileSync(path_1.default.join(migrationsDir, file), 'utf-8');
            await database_1.pool.query(sql);
            console.log(`Completed: ${file}`);
        }
    }
    console.log('All migrations completed');
    await database_1.pool.end();
}
runMigrations().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
//# sourceMappingURL=run-migrations.js.map