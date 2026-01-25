import json
import sys

def check_data():
    sys.stdout.reconfigure(encoding='utf-8')
    
    try:
        with open('C:/Users/ALAA-ORANGE/Desktop/orangedata/allorangedashboard/employees_data.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        names = data.get('employee_names', {})
        history = data.get('history', {})
        
        # 1. Find ID for "بشاير"
        target_name = "بشاير" # Arabic
        target_ids = []
        
        print("Searching for ID...")
        for eid, ename in names.items():
            if target_name in ename:
                print(f"Found ID: {eid} -> {ename}")
                target_ids.append(eid)
        
        if not target_ids:
            print("No ID found for Bashair. Trying to search raw names in history...")
            
        # 2. Check History for these IDs
        print("\nChecking History...")
        for store_code, records in history.items():
            for rec in records:
                # rec: [Date, Name, Sales, ...]
                date = rec[0]
                raw_name = rec[1]
                
                # Check if raw_name matches ID or contains it
                is_match = False
                for tid in target_ids:
                    if tid in raw_name:
                        is_match = True
                        break
                
                # Also check Arabic name just in case
                if not is_match and target_name in raw_name:
                    is_match = True
                    
                if is_match and ('01-16' in date or '16/1' in date):
                    print(f"Record: Store={store_code}, Date={date}, Name={raw_name}, Sales={rec[2]}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_data()
