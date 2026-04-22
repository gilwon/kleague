'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'kl_my_team';

interface MyTeamStorage {
  teamKo: string;
  league: 'k1' | 'k2';
}

export function useMyTeam() {
  const [data, setData] = useState<MyTeamStorage | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setData(JSON.parse(raw) as MyTeamStorage);
    } catch {}
  }, []);

  const setMyTeam = useCallback((teamKo: string | null, league?: 'k1' | 'k2') => {
    if (!teamKo || !league) {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      setData(null);
    } else {
      const next = { teamKo, league };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      setData(next);
    }
  }, []);

  return {
    myTeam: data?.teamKo ?? null,
    myTeamLeague: data?.league ?? null,
    setMyTeam,
  };
}
