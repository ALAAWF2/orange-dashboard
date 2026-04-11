import os
import datetime
import traceback
from functools import wraps
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Load Environment Variables
# Try loading from current dir, then parent dir
env_path = os.path.join(os.path.dirname(__file__), '.env')
if not os.path.exists(env_path):
    env_path = os.path.join(os.path.dirname(__file__), '../.env')
load_dotenv(env_path)

app = Flask(__name__)

# Manual CORS Handling to avoid conflicts and support credentials
@app.after_request
def after_request(response):
    origin = request.headers.get('Origin')
    if origin:
        response.headers.add('Access-Control-Allow-Origin', origin)
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type, Authorization, ngrok-skip-browser-warning')
        response.headers.add('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS')
    else:
        # Fallback for non-browser or tools
        response.headers.add('Access-Control-Allow-Origin', '*')
    return response

# Database Config
DB_USER = "postgres"
DB_PASS = "panzer123"
DB_HOST = "localhost"
DB_PORT = "5432"
DB_NAME = "showroom_sales"

CONN_STR = f"postgresql+psycopg2://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
engine = create_engine(CONN_STR)

# --- Authentication ---
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")

def check_auth(username, password):
    """Checks if username/password are valid."""
    return username == ADMIN_USERNAME and password == ADMIN_PASSWORD

def authenticate():
    """Sends a 401 response that enables basic auth."""
    return make_response(
        jsonify({"message": "Authentication Required"}), 
        401, 
        {'WWW-Authenticate': 'Basic realm="Login Required"'}
    )

def requires_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        # Skip authentication for OPTIONS preflight requests
        if request.method == 'OPTIONS':
            return '', 200
        auth = request.authorization
        if not auth or not check_auth(auth.username, auth.password):
            return authenticate()
        return f(*args, **kwargs)
    return decorated

# --- Helper ---
def normalize_emp_id(raw_id):
    """
    Normalizes employee IDs to match Dashboard logic.
    - Removes 'Unknown' prefix.
    - Preserves 4-digit format (pads with zeros).
    """
    if not raw_id: return "0000"
    
    sid = str(raw_id).strip()
    
    # 1. Handle "Unknown 789" -> "789"
    if sid.lower().startswith('unknown') or sid.lower().startswith('unkown'):
        sid = sid.lower().replace('unknown', '').replace('unkown', '').strip()
        
    # 2. Handle "ID-Name" -> "ID"
    if '-' in sid:
        sid = sid.split('-')[0].strip()
        
    # 3. Handle Legacy/Mixed formats that might be just numbers
    # If purely numeric and short, pad it
    if sid.isdigit():
        return sid.zfill(4)
        
    return sid

# --- API Endpoints ---

@app.route('/api/targets', methods=['GET', 'OPTIONS'])
@requires_auth
def get_targets():
    try:
        req_month = request.args.get('month') # Format YYYY-MM
        today = datetime.date.today()
        if not req_month:
            req_month = today.strftime('%Y-%m')
            
        target_date_start = f"{req_month}-01"
        
        with engine.connect() as conn:
            # 1. Fetch Store Targets
            store_q = text("""
                SELECT outlet_name, target_amount 
                FROM gofrugal_targets 
                WHERE target_date = :d
            """)
            df_store = conn.execute(store_q, {"d": target_date_start}).fetchall()
            store_targets = {row[0]: row[1] for row in df_store}

            # 2. Fetch Employee Targets
            # Fetch ALL targets for this month to handle any ID format
            emp_q = text("""
                SELECT employee_id, employee_name, target_amount 
                FROM employee_targets 
                WHERE target_date = :d
            """)
            df_emp = conn.execute(emp_q, {"d": target_date_start}).fetchall()
            
            emp_targets = {}
            for row in df_emp:
                # Normalize key so frontend finds it easily match with normalized employee list
                raw_id = row[0]
                norm_id = normalize_emp_id(raw_id)
                emp_targets[norm_id] = {"name": row[1], "amount": row[2]}
                
                # Also keep raw ID purely in case of mismatch? 
                # No, normalization is safer. But let's keep original key too if different?
                # No, just one canonical key.

            # 3. Fetch Master List of Stores
            stores_q = text("SELECT dynamic_number, outlet_name FROM gofrugal_outlets_mapping WHERE dynamic_number IS NOT NULL")
            all_stores = conn.execute(stores_q).fetchall()
            
        # Construct Response
        response_data = []
        for row in all_stores:
            response_data.append({
                "id": row[0],
                "outlet": row[1],
                "target": store_targets.get(row[1], 0),
            })
            
        return jsonify({
            "period": req_month,
            "stores": response_data,
            "employee_targets_raw": emp_targets
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/employees', methods=['GET', 'OPTIONS'])
@requires_auth
def get_employees_by_store():
    # Helper to get employees for a store (using history or mapping)
    store_name = request.args.get('store')
    month = request.args.get('month') # Optional: filter by specific month activity
    
    if not store_name:
        return jsonify({"error": "Store name required"}), 400
        
    try:
        with engine.connect() as conn:
            # Get Store ID
            id_q = text("SELECT dynamic_number FROM gofrugal_outlets_mapping WHERE outlet_name = :name")
            res = conn.execute(id_q, {"name": store_name}).fetchone()
            if not res:
                return jsonify([]) # Store not found
            store_id = res[0]
            
            # Find employees
            # Logic Update: Use recent activity + requested month activity
            # Default to last 60 days if no month, OR expand window to include month
            
            date_filter_clause = "item_date >= CURRENT_DATE - INTERVAL '60 days'"
            params = {"sid": store_id}
            
            if month:
                # If month provided, ensure we capture activity in that month
                # YYYY-MM
                try:
                    m_start = datetime.datetime.strptime(month, '%Y-%m').date()
                    # Look at activity from Start of that month until Now (or end of that month)
                    # Actually, usually admin wants to set targets for NEXT month.
                    # Best heuristic: Active in Last 60 days covers current staff.
                    # If someone is NEW and hasn't sold yet, they won't appear.
                    # That is a limitation, but acceptable for now.
                    pass
                except: pass
            
            # Use stricter logic: Active employees (Sales in last 60 days)
            emp_q = text(f"""
                SELECT DISTINCT sales_group 
                FROM dynamic_sales_items 
                WHERE store_number = :sid 
                  AND {date_filter_clause}
            """)
            emps = [r[0] for r in conn.execute(emp_q, params).fetchall()]
            
            # Enrich with Names + Normalize IDs
            final_list = []
            seen_ids = set()
            
            for emp_code in emps:
                # Find name in mapping
                name_q = text("SELECT arabic_name, employee_id FROM gofrugal_employee_mapping WHERE sales_group = :sg")
                name_res = conn.execute(name_q, {"sg": emp_code}).fetchone()
                
                name = emp_code
                mapped_id = None
                
                if name_res:
                    if name_res[0]: name = name_res[0]
                    if name_res[1]: mapped_id = name_res[1]
                
                # Determine "Main ID"
                # If mapped_id exists (e.g. "0030"), use it.
                # If not, use emp_code (e.g. "Unknown 789").
                raw_id = mapped_id if mapped_id else emp_code
                
                # Normalize!
                norm_id = normalize_emp_id(raw_id)
                
                # Avoid duplicates (e.g. if multiple sales_groups map to same ID)
                if norm_id in seen_ids:
                    continue
                seen_ids.add(norm_id)
                
                final_list.append({"id": norm_id, "name": name, "sales_group": emp_code})
                
        # Sort by name
        final_list.sort(key=lambda x: x['name'])
        return jsonify(final_list)
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/save_store_target', methods=['POST', 'OPTIONS'])
@requires_auth
def save_store_target():
    try:
        data = request.json
        month_str = data.get('month') # YYYY-MM
        outlet = data.get('outlet')
        amount = int(data.get('amount', 0))
        
        target_date = f"{month_str}-01"
        year = int(month_str.split('-')[0])
        month = int(month_str.split('-')[1])
        
        with engine.connect() as conn:
            # Check if exists
            check_q = text("SELECT 1 FROM gofrugal_targets WHERE outlet_name = :o AND target_date = :d")
            exists = conn.execute(check_q, {"o": outlet, "d": target_date}).fetchone()
            
            if exists:
                upd_q = text("""
                    UPDATE gofrugal_targets 
                    SET target_amount = :a, year = :y, month = :m 
                    WHERE outlet_name = :o AND target_date = :d
                """)
                conn.execute(upd_q, {"a": amount, "y": year, "m": month, "o": outlet, "d": target_date})
            else:
                ins_q = text("""
                    INSERT INTO gofrugal_targets (outlet_name, target_date, target_amount, year, month)
                    VALUES (:o, :d, :a, :y, :m)
                """)
                conn.execute(ins_q, {"o": outlet, "d": target_date, "a": amount, "y": year, "m": month})
            
            conn.commit()
            
        return jsonify({"status": "success"})
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/save_employee_target', methods=['POST', 'OPTIONS'])
@requires_auth
def save_employee_target():
    try:
        data = request.json
        month_str = data.get('month')
        emp_id_raw = data.get('emp_id')
        emp_name = data.get('emp_name', 'Unknown')
        amount = float(data.get('amount', 0))
        
        # Normalize ID before saving!
        emp_id = normalize_emp_id(emp_id_raw)
        
        target_date = f"{month_str}-01"
        
        with engine.connect() as conn:
            # Check if exists
            check_q = text("SELECT 1 FROM employee_targets WHERE employee_id = :id AND target_date = :d")
            exists = conn.execute(check_q, {"id": emp_id, "d": target_date}).fetchone()
            
            if exists:
                upd_q = text("""
                    UPDATE employee_targets 
                    SET target_amount = :a, employee_name = :n
                    WHERE employee_id = :id AND target_date = :d
                """)
                conn.execute(upd_q, {"a": amount, "n": emp_name, "id": emp_id, "d": target_date})
            else:
                ins_q = text("""
                    INSERT INTO employee_targets (employee_id, employee_name, target_date, target_amount)
                    VALUES (:id, :n, :d, :a)
                """)
                conn.execute(ins_q, {"id": emp_id, "n": emp_name, "d": target_date, "a": amount})
            
            conn.commit()
            
        # Debug print
        print(f"Saved Target: ID={emp_id} ({emp_name}) -> {amount}")
            
        return jsonify({"status": "success", "normalized_id": emp_id})
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# --- Daily Stats for Visitor Editing ---
@app.route('/api/daily_stats', methods=['GET', 'OPTIONS'])
@requires_auth
def get_daily_stats():
    """
    Get daily statistics for a store in a given month.
    Returns: date, transactions (bill count), visitors
    """
    try:
        store_id = request.args.get('store_id')
        month = request.args.get('month')  # Format: YYYY-MM
        
        if not store_id or not month:
            return jsonify({"error": "store_id and month required"}), 400
        
        # Get outlet name from store ID
        with engine.connect() as conn:
            name_q = text("SELECT outlet_name FROM gofrugal_outlets_mapping WHERE dynamic_number = :sid")
            res = conn.execute(name_q, {"sid": store_id}).fetchone()
            
            if not res:
                return jsonify({"error": "Store not found"}), 404
            
            outlet_name = res[0]
            
            # Parse month to get date range
            year, mon = month.split('-')
            start_date = f"{month}-01"
            # Get last day of month
            if int(mon) == 12:
                end_date = f"{int(year)+1}-01-01"
            else:
                end_date = f"{year}-{int(mon)+1:02d}-01"
            
            # Get transactions per day from dynamic_sales_bills
            trans_q = text("""
                SELECT bill_date::date as date, COUNT(DISTINCT transaction_id) as trans_count
                FROM dynamic_sales_bills
                WHERE store_number = :sid
                  AND bill_date >= :start_date
                  AND bill_date < :end_date
                GROUP BY bill_date
                ORDER BY date
            """)
            trans_data = conn.execute(trans_q, {
                "sid": store_id,
                "start_date": start_date,
                "end_date": end_date
            }).fetchall()
            
            trans_map = {str(row[0]): row[1] for row in trans_data}

            # Get sales & transactions per day from gofrugal_sales (for manual stores & sales data)
            sales_q = text("""
                SELECT bill_date::date as date, SUM(net_amount) as sales, COUNT(DISTINCT bill_no) as trans_count
                FROM gofrugal_sales
                WHERE outlet_name = :outlet
                  AND bill_date >= :start_date
                  AND bill_date < :end_date
                GROUP BY bill_date
            """)
            sales_data = conn.execute(sales_q, {
                "outlet": outlet_name,
                "start_date": start_date,
                "end_date": end_date
            }).fetchall()
            
            gofrugal_sales_map = {str(row[0]): float(row[1] or 0) for row in sales_data}
            sales_trans_map = {str(row[0]): row[2] for row in sales_data}
            
            # Get sales & transactions per day from dynamic_sales_items (main 2026+ data source)
            dyn_sales_q = text("""
                SELECT item_date::date as date, SUM(net_amount) as sales, COUNT(DISTINCT transaction_id) as trans_count
                FROM dynamic_sales_items
                WHERE store_number = :sid
                  AND item_date >= :start_date
                  AND item_date < :end_date
                GROUP BY item_date
            """)
            dyn_sales_data = conn.execute(dyn_sales_q, {
                "sid": store_id,
                "start_date": start_date,
                "end_date": end_date
            }).fetchall()
            
            dyn_sales_map = {str(row[0]): float(row[1] or 0) for row in dyn_sales_data}
            dyn_trans_map = {str(row[0]): row[2] for row in dyn_sales_data}
            
            # Merge sales from both sources
            all_sales_dates = set(gofrugal_sales_map.keys()) | set(dyn_sales_map.keys())
            sales_map = {}
            for d in all_sales_dates:
                if d >= '2026-01-01':
                    if d in gofrugal_sales_map:
                        sales_map[d] = gofrugal_sales_map[d]
                    else:
                        sales_map[d] = dyn_sales_map.get(d, 0)
                else:
                    sales_map[d] = gofrugal_sales_map.get(d, 0) + dyn_sales_map.get(d, 0)
            
            # Get hourly visitors per day (Modern data - Base)
            vis_hourly_q = text("""
                SELECT visit_date::date as date, SUM(visitor_count) as visitor_count
                FROM gofrugal_visitors_hourly
                WHERE outlet_name = :outlet
                  AND visit_date >= :start_date
                  AND visit_date < :end_date
                GROUP BY date
            """)
            vis_hourly_data = conn.execute(vis_hourly_q, {
                "outlet": outlet_name,
                "start_date": start_date,
                "end_date": end_date
            }).fetchall()
            
            vis_map = {str(row[0]): row[1] for row in vis_hourly_data}
            
            # Get visitors per day (Manual overrides)
            vis_q = text("""
                SELECT visit_date::date as date, visitor_count
                FROM gofrugal_visitors
                WHERE outlet_name = :outlet
                  AND visit_date >= :start_date
                  AND visit_date < :end_date
            """)
            vis_data = conn.execute(vis_q, {
                "outlet": outlet_name,
                "start_date": start_date,
                "end_date": end_date
            }).fetchall()
            
            # Apply manual overrides
            for row in vis_data:
                vis_map[str(row[0])] = row[1]
            
            # Combine all dates
            from calendar import monthrange
            days_in_month = monthrange(int(year), int(mon))[1]
            all_month_dates = set(f"{year}-{mon}-{str(day).zfill(2)}" for day in range(1, days_in_month + 1))
            
            all_dates = all_month_dates | set(trans_map.keys()) | set(vis_map.keys()) | set(sales_map.keys())
            
            result = []
            for d in sorted(all_dates):
                # Use dynamic transactions first (from bills), then dynamic_sales_items, then gofrugal_sales
                tr_count = trans_map.get(d, 0)
                if tr_count == 0:
                    tr_count = dyn_trans_map.get(d, 0)
                if tr_count == 0:
                    tr_count = sales_trans_map.get(d, 0)

                result.append({
                    "date": d,
                    "transactions": tr_count,
                    "visitors": vis_map.get(d, 0),
                    "sales": round(float(sales_map.get(d, 0) or 0), 2)
                })
            
            return jsonify(result)
            
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/daily_visitors', methods=['POST', 'OPTIONS'])
@requires_auth
def save_daily_visitors():
    """
    Update visitor counts for multiple days.
    Body: [{"date": "2026-02-01", "store_id": "1001", "visitors": 150}, ...]
    """
    try:
        updates = request.json
        
        if not updates or not isinstance(updates, list):
            return jsonify({"error": "Expected list of updates"}), 400
        
        with engine.connect() as conn:
            for update in updates:
                date = update.get('date')
                store_id = update.get('store_id')
                visitors = update.get('visitors', 0)
                
                if not date or not store_id:
                    continue
                
                # Get outlet name
                name_q = text("SELECT outlet_name FROM gofrugal_outlets_mapping WHERE dynamic_number = :sid")
                res = conn.execute(name_q, {"sid": store_id}).fetchone()
                
                if not res:
                    continue
                    
                outlet_name = res[0]
                
                # Check if record exists
                check_q = text("""
                    SELECT 1 FROM gofrugal_visitors 
                    WHERE outlet_name = :outlet AND visit_date = :d
                """)
                exists = conn.execute(check_q, {"outlet": outlet_name, "d": date}).fetchone()
                
                if exists:
                    # Update
                    upd_q = text("""
                        UPDATE gofrugal_visitors 
                        SET visitor_count = :v
                        WHERE outlet_name = :outlet AND visit_date = :d
                    """)
                    conn.execute(upd_q, {"v": visitors, "outlet": outlet_name, "d": date})
                else:
                    # Insert
                    ins_q = text("""
                        INSERT INTO gofrugal_visitors (outlet_name, visit_date, visitor_count)
                        VALUES (:outlet, :d, :v)
                    """)
                    conn.execute(ins_q, {"outlet": outlet_name, "d": date, "v": visitors})
            
            
            conn.commit()
        
        return jsonify({"status": "success", "updated": len(updates)})
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/update_sales', methods=['POST', 'OPTIONS'])
@requires_auth
def update_sales():
    """
    Update Sales & Transactions for specific stores (Warehouse/Platform).
    Body: {
        "store_id": "0", 
        "date": "2026-02-01", 
        "sales": 5000, 
        "transactions": 10
    }
    """
    try:
        data = request.json
        store_id = data.get('store_id') # Dynamic Number (e.g. '0')
        date = data.get('date') # YYYY-MM-DD
        sales = float(data.get('sales', 0))
        transactions = int(data.get('transactions', 0))
        
        if not store_id or not date:
            return jsonify({"error": "Store ID and Date required"}), 400
            
        with engine.connect() as conn:
            # 1. Verify Store Name & Type
            name_q = text("SELECT outlet_name FROM gofrugal_outlets_mapping WHERE dynamic_number = :sid")
            res = conn.execute(name_q, {"sid": store_id}).fetchone()
            
            if not res:
                return jsonify({"error": "Store not found"}), 404
                
            outlet_name = res[0]
            
            # Authorization Check: Only Warehouse or Platform
            is_allowed = 'warehouse' in outlet_name.lower() or 'platform' in outlet_name.lower()
            
            # Also allow store '0' explicitly if mapped to something else but user confirmed it's manual
            if store_id == '0': is_allowed = True
            
            if not is_allowed:
                return jsonify({"error": f"Editing Restricted: '{outlet_name}' is managed automatically. Only Warehouses/Platforms can be edited manually."}), 403
                
            # 2. Update/Insert into gofrugal_sales
            # We use 'transaction_type' = 'MANUAL_ENTRY' to distinguish? Or just standard?
            # Standard is fine.
            
            # Check if record exists
            check_q = text("""
                SELECT 1 FROM gofrugal_sales 
                WHERE outlet_name = :o AND bill_date = :d
            """)
            exists = conn.execute(check_q, {"o": outlet_name, "d": date}).fetchone()
            
            if exists:
                # Update
                upd_q = text("""
                    UPDATE gofrugal_sales 
                    SET net_amount = :s, bill_no = :t
                    WHERE outlet_name = :o AND bill_date = :d
                """)
                # Note: 'bill_no' is a string in schema usually, but we use it for count sometimes?
                # No, 'bill_no' is usually the ID.
                # 'gofrugal_sales' schema: bill_date, outlet_name, net_amount, bill_no, transaction_type...
                # Wait. 'gofrugal_sales' stores LINE items or AGGREGATED? 
                # It stores LINE items (or bills).
                # If we want to store Daily Total, we should verify schema.
                # dashboard logic sums `net_amount` and counts `distinct bill_no`.
                
                # Manual Entry Strategy:
                # We can't easily "Update" a sum if the table has multiple rows.
                # Best approach: DELETE all rows for that day/store and INSERT one aggregated row.
                # To represent "Transaction Count", we need N rows? Or can we cheat?
                # Option A: Insert 1 row with Total Sales. Transaction Count will be 1. (Bad if count matters)
                # Option B: Insert N rows? (Messy)
                # Option C: Use a dummy 'bill_no' that indicates count? Dashboard counts DISTINCT bill_no.
                # If we want Count=X, we need X distinct bill numbers.
                
                # Let's see how `update_warehouse_sales.py` did it.
                # It inserted N rows. 1 row with Sales, N-1 rows with 0 sales.
                
                # Let's do the same here.
                
                # 1. DELETE existing for this day/outlet
                del_q = text("DELETE FROM gofrugal_sales WHERE outlet_name = :o AND bill_date = :d")
                conn.execute(del_q, {"o": outlet_name, "d": date})
                
                # 2. INSERT New
                # Row 1: The Sales Value
                ins_q = text("""
                    INSERT INTO gofrugal_sales (bill_date, outlet_name, net_amount, bill_no, transaction_type, salesman)
                    VALUES (:d, :o, :s, :b, 'MANUAL', 'Admin')
                """)
                
                # Generate Bill IDs
                # Manual-YYYYMMDD-001
                date_compact = date.replace('-', '')
                
                # Row 1
                conn.execute(ins_q, {
                    "d": date, "o": outlet_name, "s": sales, 
                    "b": f"MANUAL-{date_compact}-001"
                })
                
                # Remaining Rows (Count - 1)
                if transactions > 1:
                    for i in range(2, transactions + 1):
                        dummy_id = f"MANUAL-{date_compact}-{str(i).zfill(3)}"
                        conn.execute(ins_q, {
                            "d": date, "o": outlet_name, "s": 0, 
                            "b": dummy_id
                        })
                        
            else:
                # Just Insert (Same Logic)
                ins_q = text("""
                    INSERT INTO gofrugal_sales (bill_date, outlet_name, net_amount, bill_no, transaction_type, salesman)
                    VALUES (:d, :o, :s, :b, 'MANUAL', 'Admin')
                """)
                
                date_compact = date.replace('-', '')
                
                conn.execute(ins_q, {
                    "d": date, "o": outlet_name, "s": sales, 
                    "b": f"MANUAL-{date_compact}-001"
                })
                
                if transactions > 1:
                    for i in range(2, transactions + 1):
                        dummy_id = f"MANUAL-{date_compact}-{str(i).zfill(3)}"
                        conn.execute(ins_q, {
                            "d": date, "o": outlet_name, "s": 0, 
                            "b": dummy_id
                        })
            
            conn.commit()
            
        return jsonify({"status": "success", "message": f"Updated {outlet_name}: {sales} SAR, {transactions} Tx"})
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    # Listen on all interfaces
    print("Starting Admin Server on 0.0.0.0:5000...")
    app.run(host='0.0.0.0', port=5000, debug=True)
