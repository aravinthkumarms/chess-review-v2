const fs = require('fs');
const path = require('path');
const cassandra = require('cassandra-driver');

const LESSONS_DIR = path.resolve(__dirname, '../public/lessons');
const INDEX_FILE = path.join(LESSONS_DIR, 'index.json');

const authProvider = new cassandra.auth.PlainTextAuthProvider('cassandra', 'cassandra');
const client = new cassandra.Client({
    contactPoints: ['127.0.0.1'],
    localDataCenter: 'datacenter1',
    authProvider: authProvider,
    keyspace: 'system',
    socketOptions: { readTimeout: 30000 }
});

async function migrate() {
    console.log('Connecting to Cassandra...');
    await client.connect();

    console.log('Creating keyspace chess_app...');
    await client.execute(`
        CREATE KEYSPACE IF NOT EXISTS chess_app 
        WITH replication = {'class': 'SimpleStrategy', 'replication_factor': '1'}
    `);

    await client.execute('USE chess_app');

    console.log('Creating tables...');
    await client.execute('DROP TABLE IF EXISTS courses_index');
    await client.execute(`
        CREATE TABLE courses_index (
            id text PRIMARY KEY,
            name text,
            chapters text,
            orientation text,
            kind text
        )
    `);

    await client.execute(`
        CREATE TABLE IF NOT EXISTS lessons_data (
            path text PRIMARY KEY,
            data text
        )
    `);

    console.log('Migrating course index...');
    if (!fs.existsSync(INDEX_FILE)) {
        console.error('index.json not found in public/lessons');
        process.exit(1);
    }

    const indexData = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));

    const insertCourseQuery = 'INSERT INTO courses_index (id, name, chapters, orientation, kind) VALUES (?, ?, ?, ?, ?)';
    for (const course of indexData) {
        await client.execute(insertCourseQuery, [
            course.id,
            course.name,
            JSON.stringify(course.chapters),
            course.orientation || 'w',
            course.kind || 'standard'
        ], { prepare: true });
        console.log(`Inserted course ${course.name}`);
    }

    console.log('Collecting lesson files...');
    const lessonFiles = [];

    // Recursive function to find lesson.json files
    function traverseDir(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            if (fs.statSync(fullPath).isDirectory()) {
                traverseDir(fullPath);
            } else if (file === 'lesson.json' || file === 'course.json' || file === 'chapter.json') {
                const relativePath = path.relative(LESSONS_DIR, fullPath).replace(/\\/g, '/');
                lessonFiles.push({
                    path: relativePath,
                    fullPath: fullPath
                });
            }
        }
    }

    traverseDir(LESSONS_DIR);
    console.log(`Found ${lessonFiles.length} files to migrate.`);

    const insertLessonQuery = 'INSERT INTO lessons_data (path, data) VALUES (?, ?)';

    // Process in batches
    const batchSize = 50;
    for (let i = 0; i < lessonFiles.length; i += batchSize) {
        const batch = lessonFiles.slice(i, i + batchSize);
        const promises = batch.map(fileInfo => {
            try {
                const data = fs.readFileSync(fileInfo.fullPath, 'utf-8');
                return client.execute(insertLessonQuery, [fileInfo.path, data], { prepare: true })
                    .catch(err => console.error(`Failed to migrate ${fileInfo.path}:`, err));
            } catch (e) {
                console.error(`Failed reading ${fileInfo.fullPath}`, e);
                return Promise.resolve();
            }
        });

        await Promise.all(promises);
        console.log(`Finished ${Math.min(i + batchSize, lessonFiles.length)} / ${lessonFiles.length}`);
    }

    console.log('Migration complete.');
    await client.shutdown();
    process.exit(0);
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
