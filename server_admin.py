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
# Allow CORS for development (or specify domain in production)
CORS(app) 

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

@app.route('/api/targets', methods=['GET'])
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
            stores_q = text("SELECT outlet_name FROM gofrugal_outlets_mapping WHERE dynamic_number IS NOT NULL")
            all_stores = [r[0] for r in conn.execute(stores_q).fetchall()]
            
        # Construct Response
        response_data = []
        for store in all_stores:
            response_data.append({
                "outlet": store,
                "target": store_targets.get(store, 0),
            })
            
        return jsonify({
            "period": req_month,
            "stores": response_data,
            "employee_targets_raw": emp_targets
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/employees', methods=['GET'])
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

@app.route('/api/save_store_target', methods=['POST'])
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

@app.route('/api/save_employee_target', methods=['POST'])
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

if __name__ == '__main__':
    # Listen on all interfaces
    print("Starting Admin Server on 0.0.0.0:5000...")
    app.run(host='0.0.0.0', port=5000, debug=True)
