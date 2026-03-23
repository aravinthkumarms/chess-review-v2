import { NextResponse } from 'next/server';
import { getCassandraClient } from '@/lib/cassandra';

export async function GET(
    request: Request,
    props: { params: Promise<{ slug: string[] }> }
) {
    try {
        const params = await props.params;
        // e.g. /api/lessons/course/chapter/study/lesson.json
        // slug will be ["course", "chapter", "study", "lesson.json"]
        let path = params.slug.map(decodeURIComponent).join('/');

        console.log('API Request params.slug:', params.slug);
        console.log('Decoded path querying DB:', path);

        // Some frontend calls might not include lesson.json in the slug, they might just ask for the folder.
        // In the original sync script, `study.path` includes "lesson.json". 
        // We'll trust the path exactly as passed.

        const client = getCassandraClient();
        const query = 'SELECT data FROM lessons_data WHERE path = ?';

        const result = await client.execute(query, [path], { prepare: true });

        if (result.rowLength === 0) {
            return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
        }

        const dataString = result.rows[0].data;
        const dataJson = JSON.parse(dataString);

        return NextResponse.json(dataJson);
    } catch (error) {
        console.error('Failed to fetch lesson from Cassandra:', error);
        return NextResponse.json({ error: 'Failed to fetch lesson data' }, { status: 500 });
    }
}
