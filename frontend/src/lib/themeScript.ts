/** Runs in <head> before paint so a dark-mode user never sees a white flash. Light is the default. */
export const THEME_SCRIPT = `try{if(localStorage.getItem("jagora:theme")==="dark")document.documentElement.dataset.theme="dark";var m=localStorage.getItem("jagora:mark");if(m)document.documentElement.dataset.mark=m}catch(e){}`;
