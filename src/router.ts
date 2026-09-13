import { createRouter, createWebHistory } from "vue-router";
import MapView from "./views/MapView.vue";
import ObservationView from "./views/ObservationView.vue";

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "map", component: MapView },
    { path: "/beobachtung", name: "observation", component: ObservationView },
  ],
});
