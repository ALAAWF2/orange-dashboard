import sys, json

sys.stdout.reconfigure(encoding='utf-8')
e = json.load(open('employees_data.json', encoding='utf-8'))
m = json.load(open('management_data.json', encoding='utf-8'))

current_store = {}
for store_id, records in e.get('history', {}).items():
    for r in records:
        emp_id = r[1].split('-')[0].strip()
        date = r[0]
        if emp_id not in current_store or date > current_store[emp_id]['date']:
            current_store[emp_id] = {'store': store_id, 'date': date}

store_emps = {}
for emp_id, info in current_store.items():
    sid = info['store']
    if sid not in store_emps:
        store_emps[sid] = []
    store_emps[sid].append(emp_id)

print('Store 1001 employees:', store_emps.get('1001', []))
