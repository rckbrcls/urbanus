import streamlit as st
import config

# Função para exibir a introdução
def main_tab():
    st.image(config.logo_image_path,
             use_column_width=False,
             width=1500)
    
    st.title("URBANUS – Sistema Analítico para Redes Urbanas de Saneamento")

    st.markdown("---")
    st.subheader("Projeto de Pesquisa de Mestrado em Ciência da Computação - ICMC USPSC")             

    st.subheader("Aluna: Maria do Carmo Olivé Correia")
    st.subheader("Orientadora: Profa. Dra. Mirela T. Cazzolato")

    if st.button('Continuar'):
        st.session_state.show_intro = False
