import pandas as pd
from sqlalchemy import create_engine

CONN_STR = "postgresql+psycopg2://postgres:panzer123@localhost:5432/showroom_sales"
engine = create_engine(CONN_STR)

with engine.connect() as conn:
    print("Hours using b.begin_datetime:")
    df1 = pd.read_sql("SELECT EXTRACT(HOUR FROM begin_datetime) as h, COUNT(*) as cnt FROM dynamic_sales_bills WHERE begin_datetime IS NOT NULL GROUP BY 1 ORDER BY 1", conn)
    print(df1)
    
    print("\nHours using b.begin_datetime + 3 hours:")
    df2 = pd.read_sql("SELECT EXTRACT(HOUR FROM begin_datetime + INTERVAL '3 hours') as h, COUNT(*) as cnt FROM dynamic_sales_bills WHERE begin_datetime IS NOT NULL GROUP BY 1 ORDER BY 1", conn)
    print(df2)
    
    print("\nRecent rows:")
    df3 = pd.read_sql("SELECT bill_date, begin_datetime FROM dynamic_sales_bills WHERE begin_datetime IS NOT NULL ORDER BY begin_datetime DESC LIMIT 10", conn)
    print(df3)
