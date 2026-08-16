"use client";

import { useEffect } from "react";

export default function SearchableIngredientSelect() {
  useEffect(() => {
    let activeCleanup = null;
    let bootstrap = { ingredients: [], recipes: [] };

    fetch('/api/bootstrap', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (j && !j.error) bootstrap = j; })
      .catch(() => {});

    const applyDefaultUnit = (value) => {
      const unit = document.getElementById('unit');
      if (!unit || !value) return;
      let suggested = '';
      if (value.startsWith('bulk:')) {
        const id = value.slice(5);
        suggested = bootstrap.recipes?.find(r => r.id === id)?.yield_unit || '';
      } else {
        suggested = bootstrap.ingredients?.find(i => i.id === value)?.default_unit || '';
      }
      if (!suggested) return;
      const exists = Array.from(unit.options).some(o => o.value === suggested);
      if (exists) {
        unit.value = suggested;
        unit.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };

    const enhance = () => {
      const select = document.getElementById("comp");
      if (!select || select.dataset.searchEnhanced === "true") return;

      select.dataset.searchEnhanced = "true";
      select.classList.add("searchable-native-select");

      const shell = document.createElement("div");
      shell.className = "ingredient-combobox";

      const inputWrap = document.createElement("div");
      inputWrap.className = "ingredient-combobox-input-wrap";

      const searchIcon = document.createElement("span");
      searchIcon.className = "ingredient-search-icon";
      searchIcon.textContent = "⌕";

      const input = document.createElement("input");
      input.type = "text";
      input.autocomplete = "off";
      input.spellcheck = false;
      input.className = "ingredient-search-input";
      input.placeholder = "Search ingredient or bulk recipe…";
      input.setAttribute("aria-label", "Search ingredient or bulk recipe");

      const chevron = document.createElement("span");
      chevron.className = "ingredient-combobox-chevron";
      chevron.textContent = "⌄";

      inputWrap.append(searchIcon, input, chevron);

      const menu = document.createElement("div");
      menu.className = "ingredient-search-menu";
      menu.setAttribute("role", "listbox");

      shell.append(inputWrap, menu);
      select.parentNode.insertBefore(shell, select);
      shell.appendChild(select);

      let highlighted = -1;

      const allOptions = () => {
        const rows = [];
        Array.from(select.children).forEach((child) => {
          if (child.tagName === "OPTGROUP") {
            Array.from(child.children).forEach((option) => {
              if (option.value) rows.push({
                value: option.value,
                label: option.textContent.trim(),
                group: child.label || "Items"
              });
            });
          } else if (child.tagName === "OPTION" && child.value) {
            rows.push({ value: child.value, label: child.textContent.trim(), group: "Items" });
          }
        });
        return rows;
      };

      const closeMenu = () => {
        shell.classList.remove("open");
        highlighted = -1;
      };

      const choose = (item) => {
        select.value = item.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        input.value = item.label;
        input.dataset.selectedValue = item.value;
        applyDefaultUnit(item.value);
        closeMenu();
      };

      const render = () => {
        const term = input.value.trim().toLowerCase();
        let rows = allOptions();
        if (term && !input.dataset.selectedValue) {
          rows = rows.filter((item) => item.label.toLowerCase().includes(term));
        }

        menu.innerHTML = "";
        highlighted = -1;

        if (!rows.length) {
          const empty = document.createElement("div");
          empty.className = "ingredient-search-empty";
          empty.textContent = "No matching ingredients or bulk recipes";
          menu.appendChild(empty);
          return;
        }

        let lastGroup = null;
        rows.slice(0, 80).forEach((item) => {
          if (item.group !== lastGroup) {
            lastGroup = item.group;
            const group = document.createElement("div");
            group.className = "ingredient-search-group";
            group.textContent = lastGroup;
            menu.appendChild(group);
          }

          const row = document.createElement("button");
          row.type = "button";
          row.className = "ingredient-search-option";
          row.dataset.value = item.value;
          row.setAttribute("role", "option");

          const badge = document.createElement("span");
          badge.className = item.value.startsWith("bulk:") ? "search-kind bulk" : "search-kind ingredient";
          badge.textContent = item.value.startsWith("bulk:") ? "B" : "I";

          const text = document.createElement("span");
          text.className = "ingredient-search-option-text";
          text.textContent = item.label;

          row.append(badge, text);
          row.addEventListener("mousedown", (event) => event.preventDefault());
          row.addEventListener("click", () => choose(item));
          menu.appendChild(row);
        });
      };

      const openMenu = () => {
        if (input.dataset.selectedValue) {
          input.value = "";
          delete input.dataset.selectedValue;
        }
        render();
        shell.classList.add("open");
      };

      const onInput = () => {
        delete input.dataset.selectedValue;
        render();
        shell.classList.add("open");
      };

      const onKeyDown = (event) => {
        const options = Array.from(menu.querySelectorAll(".ingredient-search-option"));
        if (event.key === "ArrowDown") {
          event.preventDefault();
          highlighted = Math.min(highlighted + 1, options.length - 1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          highlighted = Math.max(highlighted - 1, 0);
        } else if (event.key === "Enter" && highlighted >= 0 && options[highlighted]) {
          event.preventDefault();
          options[highlighted].click();
          return;
        } else if (event.key === "Escape") {
          closeMenu();
          return;
        } else {
          return;
        }
        options.forEach((option, index) => option.classList.toggle("highlighted", index === highlighted));
        options[highlighted]?.scrollIntoView({ block: "nearest" });
      };

      const onDocumentClick = (event) => {
        if (!shell.contains(event.target)) closeMenu();
      };

      input.addEventListener("focus", openMenu);
      input.addEventListener("click", openMenu);
      input.addEventListener("input", onInput);
      input.addEventListener("keydown", onKeyDown);
      document.addEventListener("click", onDocumentClick);

      activeCleanup = () => {
        document.removeEventListener("click", onDocumentClick);
      };
    };

    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    enhance();

    return () => {
      observer.disconnect();
      activeCleanup?.();
    };
  }, []);

  return null;
}
