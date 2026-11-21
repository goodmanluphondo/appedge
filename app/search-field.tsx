"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

const SEARCH_DEBOUNCE_MILLISECONDS = 250;

export function SearchField({ initialValue }: { initialValue: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialValue);
  const lastSubmitted = useRef(initialValue);

  useEffect(() => {
    if (value === lastSubmitted.current) return;
    const timer = setTimeout(() => {
      const parameters = new URLSearchParams(searchParams.toString());
      if (value.trim()) parameters.set("q", value.trim());
      else parameters.delete("q");
      parameters.delete("domain");
      lastSubmitted.current = value;
      const queryString = parameters.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    }, SEARCH_DEBOUNCE_MILLISECONDS);
    return () => clearTimeout(timer);
  }, [value, pathname, router, searchParams]);

  return <label className="search-box"><Icon name="search" size={16}/><input type="search" aria-label="Search this list" placeholder="Search this list" value={value} onChange={(event) => setValue(event.target.value)}/></label>;
}
