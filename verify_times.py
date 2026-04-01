import pandas as pd
from sqlalchemy import create_engine

CONN_STR = "postgresql+psycopg2://postgres:panzer123@localhost:5432/showroom_sales"
engine = create_engine(CONN_STR)

with engine.connect() as conn:
    df = pd.read_sql("""
        SELECT 
            EXTRACT(HOUR FROM begin_datetime) as original_hour,
            COUNT(*) as count
        FROM dynamic_sales_bills 
        WHERE bill_date = '2026-04-01'
        GROUP BY 1 ORDER BY 1
    """, conn)
    
    with open("C:/Users/ALAA-ORANGE/Desktop/orangedata/allorangedashboard/test_output.txt", "w") as f:
        f.write(df.to_string())
