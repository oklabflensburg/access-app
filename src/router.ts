import { createRouter, createWebHistory } from "vue-router";
import MapView from "./views/MapView.vue";
import NewObservationView from "./views/NewObservationView.vue";
import MyObservationsView from "./views/MyObservationsView.vue";

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "map", component: MapView },
    {
      path: "/observation",
      redirect: { name: "new-observation" },
    },
    {
      path: "/observation/new",
      name: "new-observation",
      component: NewObservationView,
    },
    {
      path: "/observation/:id/edit",
      name: "edit-observation",
      component: NewObservationView,
    },
    {
      path: "/observations",
      name: "my-observations",
      component: MyObservationsView,
    },
  ],
});
