import streamlit as st
import pandas as pd
from tab_data_spreadsheet import data_spreadsheet_tab

from tab_map import map_tab


# Função para atualizar o sidebar
def update_sidebar():
    st.sidebar.image("https://live.staticflickr.com/65535/53814991981_b07e0bf46e_b.jpg", use_column_width=False)
    st.sidebar.markdown("---")
    st.sidebar.write("### MÓDULO 1")
    st.sidebar.write("Construção do grafo não direcionado para posicionamento das similaridades (PVs)")
    st.sidebar.write("1. Entrada do arquivo de coordenadas dos alinhamentos, em Dados de Planilha")
    st.sidebar.write("2. Revisão dos vértices do grafo, no Mapa")


# Função para lançar o dashboard
def launch_w_dashboard():
    update_sidebar()

    tab_data_spreadsheet, tab_map = st.tabs(["Dados de Planilha", "Mapa"])

    with tab_data_spreadsheet:
        data_spreadsheet_tab()

    with tab_map:
        map_tab()

