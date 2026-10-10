import { createRouter, createWebHistory } from "vue-router";
import MapView from "./views/MapView.vue";
import ObservationDialogView from "./views/EditObservationDialogView.vue";
import MyObservationsView from "./views/MyObservationsView.vue";
import MyMapFeaturesView from "./views/MyMapFeaturesView.vue";
import PreferencesView from "./views/PreferencesView.vue";

export default createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "map",
      component: MapView,
      children: [
        {
          path: "observation/new",
          name: "new-observation",
          component: ObservationDialogView,
        },
        {
          path: "observations",
          name: "my-observations",
          component: MyObservationsView,
        },
        {
          path: "map-features",
          name: "my-map-features",
          component: MyMapFeaturesView,
        },
        {
          path: "preferences",
          name: "preferences",
          component: PreferencesView,
        },
        {
          path: "observation/:id/edit",
          name: "edit-observation",
          component: ObservationDialogView,
        },
      ],
    },
    {
      path: "/observation",
      redirect: { name: "new-observation" },
    },
  ],
});
