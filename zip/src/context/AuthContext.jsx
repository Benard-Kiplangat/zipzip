import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { db } from "../db";

const AuthContext = createContext(null);

const STORAGE_KEY = "bosco_current_user";

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const refreshUsers = useCallback(async () => {
    try {
      const result = await db.allDocs({
        include_docs: true,
        startkey: "user:",
        endkey: "user:\uffff",
      });
      const allUsers = result.rows
        .map((row) => row.doc)
        .filter((doc) => doc && doc.type === "user");

      setUsers(allUsers);

      if (!allUsers.length) {
        const defaultAdmin = {
          _id: "user:admin:seed",
          type: "user",
          username: "admin",
          password: "admin",
          role: "admin",
          canViewProfit: true,
          canViewStock: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await db.put(defaultAdmin);
        setUsers([defaultAdmin]);
      }
    } catch (error) {
      console.error("Failed to load users", error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

  useEffect(() => {
    const handleDbChanged = () => {
      refreshUsers();
    };

    window.addEventListener('bosco:db-changed', handleDbChanged);
    return () => window.removeEventListener('bosco:db-changed', handleDbChanged);
  }, [refreshUsers]);

  const login = useCallback(async (username, password) => {
    try {
      const matchingUser = users.find(
        (doc) => doc && doc.type === "user" && doc.username === username && doc.password === password
      );

      if (!matchingUser) {
        const result = await db.allDocs({
          include_docs: true,
          startkey: "user:",
          endkey: "user:\uffff",
        });
        const fallbackUser = result.rows
          .map((row) => row.doc)
          .find((doc) => doc && doc.type === "user" && doc.username === username && doc.password === password);

        if (!fallbackUser) {
          return false;
        }

        setCurrentUser(fallbackUser);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fallbackUser));
        return true;
      }

      setCurrentUser(matchingUser);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(matchingUser));
      return true;
    } catch (error) {
      console.error("Failed to login", error);
      return false;
    }
  }, [users]);

  const logout = useCallback(() => {
    setCurrentUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo(() => ({
    currentUser,
    users,
    loading,
    refreshUsers,
    login,
    logout,
    isAdmin: currentUser?.role === "admin",
    canViewStock: !!currentUser?.canViewStock,
    canViewProfit: !!currentUser?.canViewProfit,
  }), [currentUser, users, loading, refreshUsers, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
