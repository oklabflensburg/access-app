import { createRouter, createWebHistory } from "vue-router";
import MapView from "../views/MapView.vue";
import NewObservationView from "../views/NewObservationView.vue";
import MyObservationsView from "../views/MyObservationsView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/observations",
      component: MyObservationsView,
      meta: { title: "My observations" },
    },
    {
      path: "/observation/:id/edit",
      component: NewObservationView,
      meta: { title: "Edit observation" },
    },
    { path: "/", component: MapView, meta: { title: "Accessibility map" } },
    {
      path: "/observation/new",
      component: NewObservationView,
      meta: { title: "New observation" },
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

router.afterEach((to) => {
  document.title = `${to.meta.title} · AccessApp`;
});
