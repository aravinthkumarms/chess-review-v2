import { NextResponse } from 'next/server';
import { getCassandraClient } from '@/lib/cassandra';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const courseId = searchParams.get('courseId');

        const client = getCassandraClient();

        if (courseId) {
            const query = 'SELECT * FROM courses_index WHERE id = ?';
            const result = await client.execute(query, [courseId], { prepare: true });
            if (result.rowLength === 0) {
                return NextResponse.json({ error: 'Course not found' }, { status: 404 });
            }
            const row = result.rows[0];
            return NextResponse.json({
                id: row.id,
                name: row.name,
                chapters: JSON.parse(row.chapters),
                orientation: row.orientation,
                kind: row.kind
            });
        }

        const query = 'SELECT id, name, orientation, kind FROM courses_index';
        const result = await client.execute(query);

        const courses = result.rows.map(row => ({
            id: row.id,
            name: row.name,
            orientation: row.orientation,
            kind: row.kind
        }));

        courses.sort((a, b) => a.id.localeCompare(b.id));

        return NextResponse.json(courses);
    } catch (error) {
        console.error('Failed to fetch courses from Cassandra:', error);
        return NextResponse.json({ error: 'Failed to fetch courses data' }, { status: 500 });
    }
}
