'use client';

import { BookOpen, FileText, HelpCircle, ExternalLink, Map, Network, Upload } from 'lucide-react';
import Link from 'next/link';

export default function DocumentationPage() {
  return (
    <div className="flex flex-1 flex-col gap-8 p-4 pt-0">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Documentation</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Guia de uso e documentação do sistema URBANUS
        </p>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-6">
        {/* Quick Start */}
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
              <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Início Rápido
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Comece a usar o URBANUS em poucos passos
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800/50">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
                1
              </div>
              <div className="flex-1">
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  Selecione uma área no mapa
                </p>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Use <kbd className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs dark:bg-zinc-700">Shift + Drag</kbd> para selecionar uma área de interesse no mapa.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800/50">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
                2
              </div>
              <div className="flex-1">
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  Processe os dados
                </p>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  O sistema buscará automaticamente as ruas e dados de elevação da área selecionada.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800/50">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
                3
              </div>
              <div className="flex-1">
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  Analise e processe o grafo
                </p>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Use a página de Análise para processar o grafo e normalizar as arestas.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800/50">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
                4
              </div>
              <div className="flex-1">
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  Salve e exporte
                </p>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Salve seu projeto e exporte os dados em diferentes formatos.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-3 flex items-center gap-2">
              <Map className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Mapa Interativo</h3>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Visualize e interaja com dados geográficos em tempo real. Selecione áreas, visualize
              ruas e dados de elevação.
            </p>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-3 flex items-center gap-2">
              <Network className="h-5 w-5 text-green-600 dark:text-green-400" />
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                Processamento de Grafos
              </h3>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Normalize arestas longas subdividindo-as para criar grafos com comprimentos
              uniformes, facilitando análises posteriores.
            </p>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-3 flex items-center gap-2">
              <Upload className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Importação de Dados</h3>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Importe dados de planilhas Excel e mapas PDF com georreferenciamento para processamento
              personalizado.
            </p>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-3 flex items-center gap-2">
              <FileText className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Exportação</h3>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Exporte seus projetos em diferentes formatos (GeoJSON, JSON, CSV) para integração com
              outras ferramentas.
            </p>
          </div>
        </div>

        {/* FAQ */}
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/30">
              <HelpCircle className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Perguntas Frequentes
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Respostas para dúvidas comuns
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
              <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
                Qual é o tamanho máximo de área que posso selecionar?
              </h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                O limite padrão é de 100 km². Você pode ajustar este valor nas configurações.
              </p>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
              <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
                Como funciona o processamento de grafos?
              </h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                O sistema identifica arestas que excedem um comprimento máximo definido e as
                subdivide em múltiplas arestas menores, criando nós intermediários. Isso
                normaliza o grafo para análises posteriores.
              </p>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
              <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
                Posso importar meus próprios dados?
              </h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Sim! Use a página de Import para fazer upload de planilhas Excel com dados de
                segmentos (source/target) e mapas PDF com georreferenciamento.
              </p>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
              <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
                Em quais formatos posso exportar?
              </h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Atualmente suportamos GeoJSON (para dados geográficos), JSON (dados completos do
                projeto) e CSV (dados resumidos em planilha).
              </p>
            </div>
          </div>
        </div>

        {/* Resources */}
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/30">
              <ExternalLink className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Recursos Adicionais
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Documentação técnica e recursos
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Link
              href="/"
              className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 p-4 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/50 dark:hover:bg-zinc-800"
            >
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">Algoritmo URBANUS</p>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Documentação completa do algoritmo de processamento
                </p>
              </div>
              <ExternalLink className="h-4 w-4 text-zinc-400" />
            </Link>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
              <p className="font-medium text-zinc-900 dark:text-zinc-100">API Reference</p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Documentação da API será disponibilizada em breve
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
