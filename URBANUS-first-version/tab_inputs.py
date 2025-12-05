import streamlit as st
from tab_data_spreadsheet import data_spreadsheet_tab
from tab_map import map_tab  # Importando a nova função map_tab
from tab_graph import graph_tab  # Importando a função para exibir o grafo

# Função para atualizar o sidebar
def update_sidebar():
    st.sidebar.image("https://i.ibb.co/fH0hmZD/urbanus-cinza.png", use_column_width=False)
    st.sidebar.markdown("---")
    st.sidebar.write("### MÓDULO 1")
    st.sidebar.write("Construção do grafo não direcionado para posicionamento das similaridades (PVs)")
    st.sidebar.write("1. Entrada do arquivo de coordenadas dos alinhamentos, em Dados de Planilha")
    st.sidebar.write("2. Revisão dos vértices do grafo, no Mapa")

def inputs_tab():
    update_sidebar()
    data_spreadsheet_tab()
    map_tab()  # Chamando a nova função map_tab

    if "graph_selected" not in st.session_state:
        st.session_state.graph_selected = False

    tabs = st.columns([1, 3])
    
    with tabs[0]:
        if st.button("Selecionar aba de Grafo"):
            st.session_state.graph_selected = True

    if st.session_state.graph_selected:
        graph_tab()

if __name__ == "__main__":
    inputs_tab()
