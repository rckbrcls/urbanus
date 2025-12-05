import streamlit as st
import config
import utils

# Função para exibir a aba de Mapa
def data_spreadsheet_tab():
    st.write("# Dados de Planilha")
    
    excel_file = st.file_uploader("Escolha um arquivo Excel",
                                  type="xlsx",
                                  key="file_uploader_data_spreadsheet")
    
    if excel_file is not None and excel_file != "":
        utils.read_spreadsheet_data(excel_file) # exemplo de chamada de função no arquivo utils
        st.write(f"### Dados do arquivo {excel_file.name}")
        st.dataframe(config.df_data_points)
    else:
        st.error("Nenhum arquivo carregado.")


    