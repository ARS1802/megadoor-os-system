<script setup lang="ts">
import type { TipoProcessoProducao } from "@/dominio/enumeracoes";
import { rotuloDoProcesso } from "@/dominio/enumeracoes";

defineProps<{
  titulo: string;
  nome: string;
  extensao: string;
  processo: TipoProcessoProducao;
  descricao: string;
  dimensoesDaGrade?: string;
  tamanhoEmBytes?: number;
  modificadoEm?: Date;
  caminho?: string;
}>();

function formatarTamanho(tamanho: number): string {
  if (tamanho < 1024) return `${tamanho} B`;
  if (tamanho < 1024 ** 2)
    return `${(tamanho / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB`;
  return `${(tamanho / 1024 ** 2).toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
  })} MB`;
}

function formatarExtensao(extensao: string): string {
  return extensao.replace(/^\./, "").toUpperCase();
}

function formatarData(data?: Date): string {
  if (!data || Number.isNaN(data.getTime())) return "Não informado pelo servidor";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}
</script>

<template>
  <aside class="card file-preview-card">
    <h2>{{ titulo }}</h2>
    <div class="file-preview" role="img" :aria-label="`Prévia do arquivo ${nome}`">
      <div class="preview-sheet" aria-hidden="true">
        <svg class="file-preview__icon" viewBox="0 0 96 120" focusable="false">
          <path d="M18 4h42l22 22v90H18z" />
          <path d="M60 4v24h22" />
          <path d="M31 53h38M31 70h38M31 87h25" />
        </svg>
      </div>
    </div>
    <p class="file-description">{{ descricao }}</p>
    <dl class="metadata-list">
      <dt>Nome</dt>
      <dd>{{ nome }}</dd>
      <dt>Formato</dt>
      <dd>{{ formatarExtensao(extensao) }}</dd>
      <dt>Processo</dt>
      <dd>{{ rotuloDoProcesso(processo) }}</dd>
      <template v-if="dimensoesDaGrade">
        <dt>Grade</dt>
        <dd>{{ dimensoesDaGrade }}</dd>
      </template>
      <template v-if="tamanhoEmBytes !== undefined">
        <dt>Peso</dt>
        <dd>{{ formatarTamanho(tamanhoEmBytes) }}</dd>
      </template>
      <dt>Modificado em</dt>
      <dd>{{ formatarData(modificadoEm) }}</dd>
      <template v-if="caminho">
        <dt>Servidor</dt>
        <dd class="mono">{{ caminho }}</dd>
      </template>
    </dl>
    <div v-if="$slots.acoes" class="file-preview-card__actions">
      <slot name="acoes" />
    </div>
  </aside>
</template>
