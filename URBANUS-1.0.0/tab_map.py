

import streamlit as st
import matplotlib.pyplot as plt
import networkx as nx
import numpy as np
from PIL import Image
import io
import fitz  # PyMuPDF
import config

# Função para extrair a primeira página do PDF como imagem
def pdf_to_image(pdf_bytes):
    pdf_document = fitz.open(stream=pdf_bytes)
    page = pdf_document.load_page(0)  # carregar a primeira página
    pix = page.get_pixmap()
    image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    return image

# Função para exibir a aba de Mapa
def map_tab():
    st.write("# Mapa")
    
    # Inputs dos pontos de inserção
    coord_inf_esq = st.text_input("Insira as coordenadas X e Y do ponto inferior esquerdo (separadas por vírgula):")
    coord_sup_dir = st.text_input("Insira as coordenadas X e Y do ponto superior direito (separadas por vírgula):")
    
    # Carregar o PDF
    pdf_path = st.file_uploader("Escolha um arquivo PDF", type="pdf")

    if pdf_path is not None:
        try:
            # Se essas variáveis precisarem ser reutilizadas em outro tab, passe todas elas para o arquivo config
            x1, y1 = map(float, coord_inf_esq.split(','))
            x2, y2 = map(float, coord_sup_dir.split(','))
            config.x1, config.y1, config.x2, config.y2 = x1, y1, x2, y2  # Salvar coordenadas em config
        except ValueError:
            st.error("Por favor, insira coordenadas válidas separadas por vírgula.")
            return

        # Extrair imagem do PDF
        pdf_bytes = pdf_path.read()
        background_image = pdf_to_image(pdf_bytes)
        config.pdf_image = np.array(background_image)

        # Criar uma figura e um eixo
        fig, ax = plt.subplots()

        # Exibir a imagem de fundo
        ax.imshow(config.pdf_image, extent=[x1, x2, y1, y2])

        st.pyplot(fig)
