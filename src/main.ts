import { createApp } from "vue";
import { createPinia } from "pinia";
import PrimeVue from "primevue/config";
import Aura from "@primeuix/themes/aura";
import App from "./App.vue";
import { i18n } from "./i18n";
import "leaflet/dist/leaflet.css";
import "primeicons/primeicons.css";
import "./style.css";

createApp(App)
  .use(createPinia())
  .use(i18n)
  .use(PrimeVue, {
    theme: {
      preset: Aura,
      options: { darkModeSelector: false },
    },
  })
  .mount("#app");
