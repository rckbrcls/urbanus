# Todos as funções são definidas neste arquivo
# Cada tab importa esse arquivo, e atualiza os dados globais
# Dados globais são armazenados em config.py
# Uma vez definidas, as funções são chamadas nos tabs pelo comando utils.funcao()

import config

import numpy as np
import pandas as pd
import fitz  # PyMuPDF
import io
from PIL import Image
import matplotlib.pyplot as plt
import networkx as nx
import math



def read_spreadsheet_data(file):
    """
    Read data from input spreadsheet file
    
    Parameters
    ----------
    file: str
        path of the input file with spreadsheet data
    """
    config.input_file_path = file
    config.df_data_points = pd.read_excel(file, header=None)
    config.df_data_points.rename({0: 'source', 1: 'target'}, axis=1, inplace=True)
    config.flag_data_points_loaded = True


def open_map(pdf_path, x1, y1, x2, y2):
    """
    Open a map from pdf, and plot it using ghe coordinates
    """
    # Abrir o PDF
    pdf_document = fitz.open(stream=pdf_path.read(), filetype="pdf")
    
    # Selecionar a primeira página
    page = pdf_document.load_page(0)

    # Renderizar a página como uma imagem
    pix = page.get_pixmap()
    img_data = pix.tobytes(output="png") 

    # Converter os dados da imagem para um objeto PIL
    img = Image.open(io.BytesIO(img_data))
    
    # Plotar a imagem
    config.fig_map, ax = plt.subplots()
    ax.imshow(img, extent=[x1, x2, y1, y2], aspect='auto')


# ------------------------------------------------------------------------
# Graph functions:
# ------------------------------------------------------------------------

# Encode node tuples as integers for Node IDs
def get_node_ids(df):
    x = df.stack()
    x[:] = x.factorize()[0]
    return x.unstack()

# dividir dados em coordenadas
def parse_coordinates(df, column_name):
    return df[column_name].str.split(',', expand=True).astype(float)
    
#calcular distância euclidiana
def euclidean_distance(df):
    return np.sqrt( (df['target_x']-df['source_x'])**2 + (df['target_y']-df['source_y'])**2)

def get_node_positions_dict(df):
    pos = pd.Series(list(df[['source_x', 'source_y']].values), index=df['source_ID']).to_dict()
    pos.update(pd.Series(list(df[['target_x', 'target_y']].values), index=df['target_ID']).to_dict())
    return pos

def get_node_colors(G, original_node_count):
    # Cores dos nós
    node_colors = []
    for node in G.nodes():
        if node >= original_node_count:
            node_colors.append('olive')  # Novo nó
        elif G.degree(node) >= 3:
            node_colors.append('violet')  # Interseção
        else:
            node_colors.append('skyblue')  # Não interseção
    return node_colors

# ângulos entre arestas
def angle_between_edges(edge1, edge2):
    coord1_1, coord1_2, _ = edge1  # Ignorando o comprimento da aresta
    coord2_1, coord2_2, _ = edge2  # Ignorando o comprimento da aresta
    
    vector1 = (coord1_2[0] - coord1_1[0], coord1_2[1] - coord1_1[1])
    vector2 = (coord2_2[0] - coord2_1[0], coord2_2[1] - coord2_1[1])
    
    dot_product = vector1[0] * vector2[0] + vector1[1] * vector2[1]
    magnitude1 = math.sqrt(vector1[0] ** 2 + vector1[1] ** 2)
    magnitude2 = math.sqrt(vector2[0] ** 2 + vector2[1] ** 2)
    
    cos_angle = dot_product / (magnitude1 * magnitude2)
    angle = math.degrees(math.acos(cos_angle))
    
    return angle

# Processar grafo original para criar config.G_processed
def process_graph(G, pos, new_value):
    config.G_processed = nx.Graph()
    new_pos = pos.copy()
    new_node_id = max(G.nodes()) + 1  # Para criar novos IDs

    for edge in list(G.edges(data=True)):
        node1, node2, edge_data = edge
        edge_length = edge_data['distance']

        if edge_length < new_value:
            # Se a aresta tiver comprimento menor que new_value, adicionar no grafo processado sem modificar
            config.G_processed.add_edge(node1, node2, distance=edge_length)
        else:
            # Calcular número de nós intermediários
            num_intermediates = int(edge_length / new_value)

            # Calcular posição dos novos nós intermediários
            vector_x = pos[node2][0] - pos[node1][0]
            vector_y = pos[node2][1] - pos[node1][1]

            intermediates_positions = []
            for i in range(1, num_intermediates + 1):
                alpha = i / (num_intermediates + 1)
                intermediates_positions.append(np.array([pos[node1][0] + alpha * vector_x, pos[node1][1] + alpha * vector_y]))

            # Adicionar novos nós intermediários ao grafo processado
            prev_node = node1
            for pos_intermediate in intermediates_positions:
                new_pos[new_node_id] = pos_intermediate
                config.G_processed.add_edge(prev_node, new_node_id, distance=edge_length / (num_intermediates + 1))
                prev_node = new_node_id
                new_node_id += 1

            config.G_processed.add_edge(prev_node, node2, distance=edge_length / (num_intermediates + 1))

    # Adicionar arestas não processadas diretamente ao grafo processado
    for node1, node2, edge_data in G.edges(data=True):
        if 'distance' in edge_data:
            config.G_processed.add_edge(node1, node2, distance=edge_data['distance'])
        else:
            config.G_processed.add_edge(node1, node2)

    return config.G_processed, new_pos


def get_input_graph_data():
    config.df_data_points[['source_ID', 'target_ID']] = get_node_ids(config.df_data_points)
    config.df_data_points[['source_x', 'source_y']] = parse_coordinates(config.df_data_points, column_name='source')
    config.df_data_points[['target_x', 'target_y']] = parse_coordinates(config.df_data_points, column_name='target')
    config.df_data_points['distance'] = euclidean_distance(config.df_data_points)
    config.pos = get_node_positions_dict(config.df_data_points)
    config.G = nx.from_pandas_edgelist(config.df_data_points, source='source_ID', target='target_ID', edge_attr='distance', create_using=nx.Graph)

def compute_angles_between_edges():
    # Calcular ângulos entre arestas e gerar labels
    edge_labels = {}
    for edge in config.G.edges(data=True):
        node1_id, node2_id = edge[0], edge[1]
        edge_data = edge[2]
        edge_length = edge_data.get('distance')  # Obtenha o comprimento da aresta, se estiver disponível

        # Aresta que compartilha o mesmo nó
        for neighbor in config.G.neighbors(node1_id):
            if neighbor != node2_id:
                edge1 = (config.pos[node1_id], config.pos[node2_id], edge_length)
                edge2 = (config.pos[node1_id], config.pos[neighbor], None)  # Não temos o comprimento desta aresta
                angle = angle_between_edges(edge1, edge2)
                break

        # Se não houver node1_id, tente node2_id
        if angle is None:
            for neighbor in config.G.neighbors(node2_id):
                if neighbor != node1_id:
                    edge1 = (config.pos[node2_id], config.pos[node1_id], edge_length)
                    edge2 = (config.pos[node2_id], config.pos[neighbor], None)  # Não temos o comprimento desta aresta
                    angle = angle_between_edges(edge1, edge2)
                    break

        # Adicionar label
        label = f"ID: ({node1_id}, {node2_id})\n"
        if edge_length is not None:
            label += f"Length: {edge_length:.2f}\n"
        if angle is not None:
            label += f"Angle: {angle:.2f}°"
        edge_labels[(node1_id, node2_id)] = label

def generate_processed_graph():
    # Processar o grafo original para criar o G_processed
    config.G_processed, config.new_pos = process_graph(config.G, config.pos, config.new_base_interval_value)
    
    # Inicializar as cores dos nós para o grafo processado
    original_node_count = len(config.G.nodes())
    config.node_colors_processed = get_node_colors(config.G_processed, original_node_count)

def update_graph_colors():
    # Atualizar cores dos nós para o novo grafo processado
    original_node_count = len(config.G.nodes())
    config.node_colors_processed = get_node_colors(config.G_processed, original_node_count)

def draw_built_graph():
    # Verificar se config.G_processed e config.new_pos estão definidos
    if config.G_processed is None or config.new_pos is None:
        return
    
    # Verificar se config.node_colors_processed está definido e tem o mesmo número de nós que config.G_processed
    if config.node_colors_processed is None or len(config.node_colors_processed) != len(config.G_processed.nodes):
        # Atualizar as cores dos nós
        original_node_count = len(config.G.nodes())
        config.node_colors_processed = get_node_colors(config.G_processed, original_node_count)

    # Visualizar o grafo processado
    config.fig_graph = plt.figure(figsize=(10, 10))

    nx.draw(config.G_processed, pos=config.new_pos,
            with_labels=True, node_size=30,
            node_color=config.node_colors_processed,
            edge_color="gray", font_size=15)
