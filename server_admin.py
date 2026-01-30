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

# --- API Endpoints ---

@app.route('/api/targets', methods=['GET'])
@requires_auth
def get_targets():
    try:
        # Get Month/Year from query or default to next month
        today = datetime.date.today()
        # Default target date: 1st of Next Month? Or Current Month?
        # Usually targets are set for the current or next month.
        # Let's return targets for a range (Current - 1 Month to Current + 2 Months)
        # Or just let user filter.
        
        # Simple Approach: Fetch All Targets (Grouped by Store) for a specific requested month.
        # If no month provided, default to current month.
        
        req_month = request.args.get('month') # Format YYYY-MM
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
            emp_q = text("""
                SELECT employee_id, employee_name, target_amount 
                FROM employee_targets 
                WHERE target_date = :d
            """)
            df_emp = conn.execute(emp_q, {"d": target_date_start}).fetchall()
            emp_targets = {}
            for row in df_emp:
                emp_targets[row[0]] = {"name": row[1], "amount": row[2]}

            # 3. Fetch Master List of Stores (to show 0 if no target)
            stores_q = text("SELECT outlet_name FROM gofrugal_outlets_mapping WHERE dynamic_number IS NOT NULL")
            all_stores = [r[0] for r in conn.execute(stores_q).fetchall()]
            
        # Construct Response
        response_data = []
        for store in all_stores:
            response_data.append({
                "outlet": store,
                "target": store_targets.get(store, 0),
                # We don't link employees to stores here yet, fetching details is better done on demand or separately?
                # No, let's fetch employees list for this store.
                # Problem: employee_targets table doesn't have store_id. 
                # We need to join with mapping.
            })
            
        return jsonify({
            "period": req_month,
            "stores": response_data,
            "employee_targets_raw": emp_targets # Send raw map, frontend can map to stores if it knows valid employees
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/employees', methods=['GET'])
@requires_auth
def get_employees_by_store():
    # Helper to get employees for a store (using history or mapping)
    store_name = request.args.get('store')
    if not store_name:
        return jsonify({"error": "Store name required"}), 400
        
    # We use gofrugal_employee_mapping linked to gofrugal_sales or just the mapping table?
    # Trying to find which employees belong to which store is tricky if they move.
    # Best guess: Sales history last 30 days.
    try:
        with engine.connect() as conn:
            # Get Store ID
            id_q = text("SELECT dynamic_number FROM gofrugal_outlets_mapping WHERE outlet_name = :name")
            res = conn.execute(id_q, {"name": store_name}).fetchone()
            if not res:
                return jsonify([]) # Store not found
            store_id = res[0]
            
            # Find employees who sold in this store recently (last 60 days)
            emp_q = text("""
                SELECT DISTINCT sales_group 
                FROM dynamic_sales_items 
                WHERE store_number = :sid 
                  AND item_date >= CURRENT_DATE - INTERVAL '60 days'
            """)
            emps = [r[0] for r in conn.execute(emp_q, {"sid": store_id}).fetchall()]
            
            # Enrich with Names
            final_list = []
            for emp_code in emps:
                # Find name
                name_q = text("SELECT arabic_name, employee_id FROM gofrugal_employee_mapping WHERE sales_group = :sg")
                name_res = conn.execute(name_q, {"sg": emp_code}).fetchone()
                
                name = emp_code
                real_id = emp_code
                if name_res:
                    if name_res[0]: name = name_res[0]
                    if name_res[1]: real_id = name_res[1]
                
                final_list.append({"id": real_id, "name": name, "sales_group": emp_code})
                
        return jsonify(final_list)
        
    except Exception as e:
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
        emp_id = data.get('emp_id')
        emp_name = data.get('emp_name', 'Unknown')
        amount = float(data.get('amount', 0))
        
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
            
        return jsonify({"status": "success"})
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Listen on all interfaces
    print("Starting Admin Server on 0.0.0.0:5000...")
    app.run(host='0.0.0.0', port=5000, debug=True)
