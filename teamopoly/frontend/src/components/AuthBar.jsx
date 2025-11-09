import { useEffect, useState } from "react";
import { getUsers } from "../api";

export default function AuthBar({ currentUser, setCurrentUser }) {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const { users } = await getUsers();
        setUsers(users || []);
      } catch (e) {
        // fallback demo users if API not available
        setUsers([
          { id: "alice", name: "Alice", avatar: "https://github.com/alice.png" },
          { id: "bob",   name: "Bob",   avatar: "https://github.com/bob.png"   },
          { id: "cara",  name: "Cara",  avatar: "https://github.com/cara.png"  },
        ]);
      }
    })();
  }, []);

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm opacity-80">Signed in as</span>
      <select
        value={currentUser}
        onChange={(e) => {
          setCurrentUser(e.target.value);
          localStorage.setItem("teamopoly_user", e.target.value);
        }}
        className="border rounded-lg px-3 py-1.5 bg-white"
      >
        {users.map(u => (
          <option key={u.id} value={u.id}>
            {u.name || u.id}
          </option>
        ))}
      </select>
      {users.find(u => u.id === currentUser)?.avatar && (
        <img
          src={users.find(u => u.id === currentUser)?.avatar}
          alt={currentUser}
          className="w-8 h-8 rounded-full border"
        />
      )}
    </div>
  );
}
