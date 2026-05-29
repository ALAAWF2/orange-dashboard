import os
from sqlalchemy import create_engine, text

DB_USER = "postgres"
DB_PASS = "panzer123"
DB_HOST = "localhost"
DB_PORT = "5432"
DB_NAME = "showroom_sales"

CONN_STR = f"postgresql+psycopg2://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
engine = create_engine(CONN_STR)

query = """
WITH date_series AS (
    SELECT CAST(g AS date) as d_date
    FROM generate_series(CURRENT_DATE - INTERVAL '14 days', CURRENT_DATE - INTERVAL '1 day', INTERVAL '1 day') g
),
store_daily_sales AS (
    SELECT store_number, item_date as d_date, SUM(net_amount) as sales_amount
    FROM dynamic_sales_items
    WHERE item_date >= CURRENT_DATE - INTERVAL '14 days'
    GROUP BY store_number, item_date
),
store_daily_visitors AS (
    SELECT outlet_name, visit_date as d_date, SUM(visitor_count) as visitors_count
    FROM gofrugal_visitors
    WHERE visit_date >= CURRENT_DATE - INTERVAL '14 days'
    GROUP BY outlet_name, visit_date
),
store_hourly_stats AS (
    SELECT outlet_name, visit_date as d_date,
           COUNT(CASE WHEN visit_hour BETWEEN 10 AND 22 AND visitor_count > 0 THEN 1 END) as active_hours
    FROM gofrugal_visitors_hourly
    WHERE visit_date >= CURRENT_DATE - INTERVAL '14 days'
    GROUP BY outlet_name, visit_date
)
SELECT 
    o.outlet_name, 
    o.dynamic_number,
    dates.d_date,
    COALESCE(ds.sales_amount, 0) as sales_amount,
    COALESCE(dv.visitors_count, 0) as visitors_count,
    COALESCE(sh.active_hours, 0) as active_hours
FROM gofrugal_outlets_mapping o
CROSS JOIN date_series dates
LEFT JOIN store_daily_sales ds ON o.dynamic_number = ds.store_number AND dates.d_date = ds.d_date
LEFT JOIN store_daily_visitors dv ON o.outlet_name = dv.outlet_name AND dates.d_date = dv.d_date
LEFT JOIN store_hourly_stats sh ON o.outlet_name = sh.outlet_name AND dates.d_date = sh.d_date
WHERE o.outlet_type = 'Showroom'
  AND (ds.sales_amount > 0 OR dv.visitors_count > 0)
ORDER BY dates.d_date DESC, o.outlet_name
"""

try:
    with engine.connect() as conn:
        res = conn.execute(text(query)).fetchall()
        issues = []
        for r in res:
            branch_name, code, date_val, sales, visitors, active_hours = r
            # Let's say: store has sales > 100
            if sales > 100:
                if visitors == 0:
                    issues.append({
                        "branch": branch_name,
                        "code": code,
                        "date": str(date_val),
                        "sales_amount": float(sales),
                        "visitors_count": int(visitors),
                        "issue_type": "متوقفة تماماً",
                        "active_hours": int(active_hours),
                        "details": "العداد سجل 0 زوار طوال اليوم بالرغم من وجود مبيعات"
                    })
                elif active_hours < 6:
                    issues.append({
                        "branch": branch_name,
                        "code": code,
                        "date": str(date_val),
                        "sales_amount": float(sales),
                        "visitors_count": int(visitors),
                        "issue_type": "تعمل جزئياً",
                        "active_hours": int(active_hours),
                        "details": f"العداد يعمل بشكل متقطع (بث لـ {active_hours} ساعات فقط من أصل 13 ساعة تشغيل)"
                    })
        print(f"Total issues found: {len(issues)}")
        for idx, iss in enumerate(issues[:10]):
            print(f"{idx+1}. {iss['branch']} ({iss['date']}): {iss['issue_type']} - {iss['details']}, Sales: {iss['sales_amount']:.1f}, Visitors: {iss['visitors_count']}")
except Exception as e:
    import traceback
    traceback.print_exc()
