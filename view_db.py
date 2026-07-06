import sqlite3
import json

DB_PATH = "mission_sessions.db"

def view_sessions():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Get column names
        cursor.execute("PRAGMA table_info(sessions)")
        columns = [col[1] for col in cursor.fetchall()]
        
        # Get data
        cursor.execute("SELECT * FROM sessions ORDER BY timestamp DESC")
        rows = cursor.fetchall()
        
        if not rows:
            print("\n[INFO] Database is empty. Save a session from the dashboard first!")
            return

        print(f"\n{'='*100}")
        print(f"{'MISSION SESSION LOG':^100}")
        print(f"{'='*100}\n")
        
        header = f"{'ID':<20} | {'Date/Time':<20} | {'Frames':<6} | {'Targets':<7} | {'Humans':<6} | {'Avg Prio'}"
        print(header)
        print("-" * len(header))
        
        for r in rows:
            # r[0]: id, r[1]: timestamp, r[2]: frame_count, r[3]: total_targets, r[4]: human_targets, r[5]: avg_priority
            print(f"{r[0]:<20} | {r[1][:19]:<20} | {r[2]:<6} | {r[3]:<7} | {r[4]:<6} | {r[5]:.2f}")
            
        print(f"\n{'='*100}")
        conn.close()
    except Exception as e:
        print(f"[ERROR] Could not read database: {e}")

if __name__ == "__main__":
    view_sessions()
