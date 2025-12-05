

import config
import utils
import streamlit as st
import networkx as nx
import matplotlib.pyplot as plt

# Função para exibir a aba de Grafo
def graph_tab():
    if config.df_data_points is not None:
        st.write("# Grafo sobre o Mapa")

        # Dividir a página em duas colunas: uma para os inputs e outra para o grafo
        col1, col2 = st.columns([1, 3])

        with col1:
            # Inputs para o usuário ajustar o tamanho das labels e dos nós
            node_size = st.number_input("Tamanho dos nós", min_value=10, max_value=100, value=50, step=10)
            font_size = st.number_input("Tamanho do texto das labels", min_value=2, max_value=50, value=2, step=1)
            config.new_base_interval_value = st.number_input(label="Valor base para definir os intervalos", value=100, step=10)

        utils.get_input_graph_data()
        utils.compute_angles_between_edges()
        utils.generate_processed_graph()
        utils.update_graph_colors()

        with col2:
            # Criar uma figura e um eixo
            fig, ax = plt.subplots()

            if config.pdf_image is not None:
                # Exibir a imagem de fundo
                ax.imshow(config.pdf_image, extent=[config.x1, config.x2, config.y1, config.y2])

            # Desenhar o grafo sobre a imagem
            nx.draw(config.G_processed, pos=config.new_pos, ax=ax, with_labels=True,
                    node_color=config.node_colors_processed, edge_color="gray",
                    node_size=node_size, font_size=font_size)  # Usando inputs do usuário

            st.pyplot(fig)
