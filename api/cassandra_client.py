from cassandra.cluster import Cluster
from cassandra.auth import PlainTextAuthProvider
import logging

logger = logging.getLogger(__name__)

class CassandraClient:
    """Manages connection to local Cassandra cluster."""
    
    _instance = None
    _cluster = None
    _session = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(CassandraClient, cls).__new__(cls)
        return cls._instance
    
    def connect(self, hosts=["127.0.0.1"], port=9042, keyspace="chess_analysis", 
                username=None, password=None):
        """
        Establish connection to Cassandra cluster.
        
        Args:
            hosts: List of Cassandra node addresses (default: localhost)
            port: Cassandra port (default: 9042)
            keyspace: Keyspace name to use
            username: Optional authentication username
            password: Optional authentication password
        """
        try:
            if self._session is not None:
                logger.info("Already connected to Cassandra")
                return self._session
            
            auth_provider = None
            if username and password:
                auth_provider = PlainTextAuthProvider(username, password)
            
            self._cluster = Cluster(
                contact_points=hosts,
                port=port,
                auth_provider=auth_provider
            )
            
            self._session = self._cluster.connect(keyspace)
            logger.info(f"Connected to Cassandra cluster on {hosts} with keyspace '{keyspace}'")
            return self._session
        except Exception as e:
            logger.error(f"Failed to connect to Cassandra: {e}")
            raise
    
    def get_session(self):
        """Get current Cassandra session."""
        if self._session is None:
            raise RuntimeError("Not connected to Cassandra. Call connect() first.")
        return self._session
    
    def disconnect(self):
        """Close connection to Cassandra."""
        try:
            if self._session:
                self._session.shutdown()
            if self._cluster:
                self._cluster.shutdown()
            self._session = None
            self._cluster = None
            logger.info("Disconnected from Cassandra")
        except Exception as e:
            logger.error(f"Error disconnecting from Cassandra: {e}")
    
    def create_keyspace(self, keyspace_name="chess_analysis", replication_factor=1):
        """Create keyspace if it doesn't exist."""
        try:
            temp_session = self._cluster.connect() if self._cluster else Cluster(["127.0.0.1"]).connect()
            
            query = f"""
            CREATE KEYSPACE IF NOT EXISTS {keyspace_name}
            WITH replication = {{'class': 'SimpleStrategy', 'replication_factor': {replication_factor}}}
            """
            temp_session.execute(query)
            logger.info(f"Keyspace '{keyspace_name}' created/verified")
            
            if self._cluster is None:
                temp_session.shutdown()
        except Exception as e:
            logger.error(f"Failed to create keyspace: {e}")
            raise
    
    def create_tables(self, keyspace="chess_analysis"):
        """Create chess analysis tables."""
        try:
            session = self.get_session()
            
            # Games table
            session.execute(f"""
            CREATE TABLE IF NOT EXISTS {keyspace}.games (
                game_id UUID PRIMARY KEY,
                player_white TEXT,
                player_black TEXT,
                result TEXT,
                date TIMESTAMP,
                pgn TEXT,
                created_at TIMESTAMP
            )
            """)
            
            # Moves table
            session.execute(f"""
            CREATE TABLE IF NOT EXISTS {keyspace}.moves (
                game_id UUID,
                move_number INT,
                fen TEXT,
                san TEXT,
                uci TEXT,
                evaluation INT,
                cp_loss INT,
                classification TEXT,
                is_white BOOLEAN,
                PRIMARY KEY ((game_id), move_number)
            ) WITH CLUSTERING ORDER BY (move_number ASC)
            """)
            
            # Move classifications table
            session.execute(f"""
            CREATE TABLE IF NOT EXISTS {keyspace}.move_stats (
                classification TEXT PRIMARY KEY,
                count INT,
                avg_cp_loss INT
            )
            """)
            
            logger.info(f"Tables created/verified in keyspace '{keyspace}'")
        except Exception as e:
            logger.error(f"Failed to create tables: {e}")
            raise

# Singleton instance
_cassandra_client = None

def get_cassandra_client():
    """Get or create Cassandra client singleton."""
    global _cassandra_client
    if _cassandra_client is None:
        _cassandra_client = CassandraClient()
    return _cassandra_client
