<script setup lang="ts">
import AppHeader from "@/componentes/AppHeader.vue";
</script>

<template>
  <main class="page-shell">
    <AppHeader
      titulo="Menu administrativo"
      :voltar-para="{ name: 'resumoAdministrativo' }"
      rotulo-voltar="Resumo"
    />
    <h1>Administração</h1>
    <section class="menu-grid">
      <RouterLink class="menu-card" :to="{ name: 'painelAdministrador' }"
        ><strong>Produção</strong><span>Acompanhamento das Ordens de Serviço.</span></RouterLink
      >
      <RouterLink class="menu-card" :to="{ name: 'resumoAdministrativo' }"
        ><strong>Resumo</strong
        ><span>Ordens recentes, concluídas e usuários conectados.</span></RouterLink
      >
      <article class="menu-card menu-card--disabled" aria-disabled="true">
        <strong>Candidatos</strong><span>Tela aguardando definição.</span>
      </article>
      <article class="menu-card menu-card--disabled" aria-disabled="true">
        <strong>Materiais</strong><span>Tela aguardando definição.</span>
      </article>
      <article class="menu-card menu-card--disabled" aria-disabled="true">
        <strong>Maquinistas</strong><span>Tela ainda não representada.</span>
      </article>
      <article class="menu-card menu-card--disabled" aria-disabled="true">
        <strong>Designers</strong><span>Tela ainda não representada.</span>
      </article>
    </section>
  </main>
</template>
