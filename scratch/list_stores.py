import os
from sqlalchemy import create_engine, text

DB_USER = "postgres"
DB_PASS = "panzer123"
DB_HOST = "localhost"
DB_PORT = "5432"
DB_NAME = "showroom_sales"

CONN_STR = f"postgresql+psycopg2://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
engine = create_engine(CONN_STR)

try:
    with engine.connect() as conn:
        res = conn.execute(text("SELECT outlet_name, dynamic_number, outlet_type FROM gofrugal_outlets_mapping")).fetchall()
        for r in res:
            print(r)
except Exception as e:
    import traceback
    traceback.print_exc()
