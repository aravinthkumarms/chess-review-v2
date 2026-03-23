import { Client, auth } from 'cassandra-driver';

declare global {
    var cassandraClient: Client | undefined;
}

export const getCassandraClient = () => {
    if (!global.cassandraClient) {
        const contactPoints = (process.env.CASSANDRA_HOST || '127.0.0.1').split(',');
        const user = process.env.CASSANDRA_USER || 'cassandra';
        const pass = process.env.CASSANDRA_PASS || 'cassandra';

        const authProvider = new auth.PlainTextAuthProvider(user, pass);
        global.cassandraClient = new Client({
            contactPoints: contactPoints,
            localDataCenter: process.env.CASSANDRA_DATACENTER || 'datacenter1',
            keyspace: process.env.CASSANDRA_KEYSPACE || 'chess_app',
            authProvider: authProvider,
            socketOptions: { readTimeout: 30000 }
        });

        global.cassandraClient.on('log', (level, className, message, furtherInfo) => {
            if (level === 'info') return;
            console.log('Cassandra %s: %s', level, message);
        });

        global.cassandraClient.connect()
            .then(() => console.log('Successfully connected to Cassandra.'))
            .catch(err => console.error('Cassandra Connection Error:', err));
    }
    return global.cassandraClient;
};
