import json

data_path = 'employees_data.json'

try:
    with open(data_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    target_name = "R"
    found = False
    
    print(f"Searching for employee name '{target_name}' or similar in {data_path}...")

    if 'history' in data:
        for store_code, records in data['history'].items():
            for record in records:
                # record format: [date, emp_id_or_name, sales, ...]
                if len(record) > 1:
                    emp_val = str(record[1]).strip()
                    
                    # Check for exact match or "R-" pattern
                    if emp_val == "R" or emp_val == "r" or emp_val.startswith("R-") or emp_val.endswith("-R"):
                        print(f"FOUND in Store {store_code}: Record: {record}")
                        found = True
                        
    if not found:
        print(f"No exact match for employee '{target_name}' found in history.")

    # Also check employee_names mapping
    if 'employee_names' in data:
        print("\nChecking employee_names mapping...")
        for eid, name in data['employee_names'].items():
            if name.strip() == "R" or eid.strip() == "R":
                print(f"Found in mapping: {eid} -> {name}")

except Exception as e:
    print(f"Error: {e}")
