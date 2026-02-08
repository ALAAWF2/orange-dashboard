import json

data_path = 'employees_data.json'

try:
    with open(data_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    target_id = "2855"
    found = False
    
    print(f"Searching for employee {target_id} in {data_path}...")

    if 'history' in data:
        for store_code, records in data['history'].items():
            for record in records:
                # record format: [date, emp_id_or_name, sales, ...]
                if len(record) > 1:
                    emp_val = str(record[1]).strip()
                    if target_id in emp_val:
                        print(f"FOUND: Record in Store {store_code}: {record}")
                        found = True
                        # Don't break, find all occurrences or at least a few
                        if found: break 
            if found: break

    if not found:
        print(f"Employee {target_id} NOT FOUND in history data.")
        
    # Also check employee_names if it exists
    if 'employee_names' in data:
        print("\nChecking employee_names mapping...")
        for eid, name in data['employee_names'].items():
            if target_id in str(eid):
                print(f"Found in employee_names: {eid} -> {name}")

except Exception as e:
    print(f"Error: {e}")
