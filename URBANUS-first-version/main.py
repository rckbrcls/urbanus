# Arquivo principal do aplicativo URBANUS
# Não adicionar outras funções ou componentes a esse arquivo
# A função printipal da main é inicializar o aplicativo e organizar as abas

import streamlit as st
from tab_main import main_tab
from tab_inputs import inputs_tab
from tab_graph import graph_tab

# Configuração da página principal
st.set_page_config(
    layout="wide",
    page_icon="🌍",
    page_title="URBANUS",
    initial_sidebar_state="auto"
)

# Função principal para gerenciar a navegação entre as páginas
def main():
    # st.title("URBANUS - Sistema de Análise Urbana")

    # Verifica se o usuário já passou pela introdução
    if 'show_intro' not in st.session_state:
        st.session_state.show_intro = True

    if st.session_state.show_intro:
        main_tab()
    else:
        inputs_tab()

if __name__ == "__main__":
    main()
