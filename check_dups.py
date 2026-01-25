import json
import sys

def check_duplicates():
    # Set stdout to utf-8 just in case
    sys.stdout.reconfigure(encoding='utf-8')
    
    try:
        with open('C:/Users/ALAA-ORANGE/Desktop/orangedata/allorangedashboard/employees_data.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        history = data.get('history', {})
        
        # Look for "Bashair" (or part of the name)
        target_name = "بشاير"
        
        found_records = []
        
        print(f"Checking for duplicates for: {target_name} on 16/1 using UTF-8")
        
        for store_code, records in history.items():
            for rec in records:
                # rec: [Date, Name, Sales, Trans, Items, MaxTicket]
                date, name = rec[0], rec[1]
                
                if target_name in name:
                    sales = rec[2]
                    # Check for 16 Jan
                    if '01-16' in date:
                        print(f"Found: Store={store_code}, Date={date}, Sales={sales}, Trans={rec[3]}")
                        found_records.append(str(rec))
                        
        # Check specific duplicates
        from collections import Counter
        c = Counter(found_records)
        duplicate_found = False
        for rec_str, cnt in c.items():
            if cnt > 1:
                duplicate_found = True
                print(f"!!! DUPLICATE FOUND ({cnt} times) !!!")
                print(rec_str)
        
        if not duplicate_found:
            print("No duplicates found for Bashair on Jan 16.")
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_duplicates()
