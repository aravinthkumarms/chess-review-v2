import { NextResponse } from 'next/server';
import os from 'os';
import { getCassandraClient } from '@/lib/cassandra';

// Helper to get the username reliably
const getUserId = () => {
    try {
        const userInfo = os.userInfo();
        return userInfo.username || 'default_user';
    } catch (e) {
        return 'default_user';
    }
};

// Initialize the table if it doesn't exist
const ensureTableExists = async (client: any) => {
    const query = `
        CREATE TABLE IF NOT EXISTS chess_app.user_progress (
            user_id text PRIMARY KEY,
            completed_studies set<text>
        );
    `;
    await client.execute(query);
};

export async function GET() {
    try {
        const client = getCassandraClient();
        await ensureTableExists(client);

        const userId = getUserId();
        const query = 'SELECT completed_studies FROM chess_app.user_progress WHERE user_id = ?';

        const result = await client.execute(query, [userId], { prepare: true });

        let completedStudies: string[] = [];
        if (result.rowLength > 0 && result.rows[0].completed_studies) {
            completedStudies = Array.from(result.rows[0].completed_studies);
        }

        return NextResponse.json({ completedStudies });
    } catch (error) {
        console.error('Cassandra GET Error:', error);
        return NextResponse.json({ completedStudies: [] }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { studyId } = body;

        if (!studyId || typeof studyId !== 'string') {
            return NextResponse.json({ error: 'Invalid studyId' }, { status: 400 });
        }

        const client = getCassandraClient();
        await ensureTableExists(client);

        const userId = getUserId();

        // Add the studyId to the set
        // Cassandra SET handles uniqueness automatically
        const query = 'UPDATE chess_app.user_progress SET completed_studies = completed_studies + ? WHERE user_id = ?';

        // The driver expects an Array for SET parameters
        await client.execute(query, [[studyId], userId], { prepare: true });

        // Fetch back the updated list (optional, but good for returning the new state)
        const fetchQuery = 'SELECT completed_studies FROM chess_app.user_progress WHERE user_id = ?';
        const result = await client.execute(fetchQuery, [userId], { prepare: true });

        let completedStudies: string[] = [];
        if (result.rowLength > 0 && result.rows[0].completed_studies) {
            completedStudies = Array.from(result.rows[0].completed_studies);
        }

        return NextResponse.json({ completedStudies });
    } catch (error) {
        console.error('Cassandra POST Error:', error);
        return NextResponse.json({ error: 'Failed to update progress' }, { status: 500 });
    }
}
